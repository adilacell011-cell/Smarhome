import onvif from "onvif";

const { Cam } = onvif;

// Extract username/password from an RTSP URL (rtsp://user:pass@ip:port/...)
export function parseRtspCreds(rtspUrl?: string): { username: string; password: string } {
  const fallback = { username: "admin", password: "" };
  if (!rtspUrl) return fallback;
  const m = rtspUrl.match(/^rtsp:\/\/([^:@/]+):([^@/]*)@/i);
  if (m) return { username: decodeURIComponent(m[1]), password: decodeURIComponent(m[2]) };
  return fallback;
}

// ONVIF often returns a stream/snapshot URI WITHOUT credentials; ffmpeg/fetch need them.
function injectCreds(uri: string, username: string, password: string): string {
  if (!uri || !username) return uri;
  if (/^[a-z]+:\/\/[^/@]*@/i.test(uri)) return uri; // already has user:pass@
  return uri.replace(
    /^([a-z]+):\/\//i,
    (m) => `${m}${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
  );
}

// Strip credentials before logging a URL.
function maskUrl(url: string): string {
  return url.replace(/(:\/\/)[^/@]*@/, "$1***@");
}

// The `onvif` lib normalizes most replies to `{ uri }`, but be defensive about the
// different Media1/Media2 (and linerase array) shapes so a valid URI is never missed.
function pickUri(obj: any): string | undefined {
  if (!obj) return undefined;
  const node = Array.isArray(obj) ? obj[0] : obj;
  if (!node) return undefined;
  const candidate =
    node.uri ||
    node.mediaUri?.uri ||
    (Array.isArray(node.mediaUri) ? node.mediaUri[0]?.uri : undefined) ||
    node.getStreamUriResponse?.mediaUri?.uri ||
    node.getSnapshotUriResponse?.uri;
  return typeof candidate === "string" && candidate ? candidate : undefined;
}

type MediaUris = { streamUri?: string; snapshotUri?: string };

// Cache discovery so we don't pay the ONVIF round-trip (or its timeout) on every frame.
const cache = new Map<string, { uris: MediaUris; ts: number; ok: boolean }>();
const OK_TTL = 5 * 60 * 1000;
const FAIL_TTL = 60 * 1000;

function discover(ip: string, port: number, username: string, password: string): Promise<MediaUris> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (u: MediaUris) => { if (!settled) { settled = true; resolve(u); } };
    const timeout = setTimeout(() => done({}), 6000);

    try {
      const cam: any = new Cam(
        { hostname: ip, username, password, port, timeout: 4000 },
        function (this: any, err: any) {
          if (err) { clearTimeout(timeout); return done({}); }
          const self = this;
          self.getStreamUri({ protocol: "RTSP" }, (sErr: any, stream: any) => {
            const rawStream = sErr ? undefined : pickUri(stream);
            const streamUri = rawStream ? injectCreds(rawStream, username, password) : undefined;
            try {
              self.getSnapshotUri({}, (snErr: any, snap: any) => {
                clearTimeout(timeout);
                const rawSnap = snErr ? undefined : pickUri(snap);
                const snapshotUri = rawSnap ? injectCreds(rawSnap, username, password) : undefined;
                done({ streamUri, snapshotUri });
              });
            } catch {
              clearTimeout(timeout);
              done({ streamUri });
            }
          });
        }
      );
    } catch {
      clearTimeout(timeout);
      done({});
    }
  });
}

async function getUris(ip: string, port: number, username: string, password: string): Promise<MediaUris> {
  const key = `${ip}:${port}`;
  const now = Date.now();
  const c = cache.get(key);
  if (c && now - c.ts < (c.ok ? OK_TTL : FAIL_TTL)) return c.uris;
  const uris = await discover(ip, port, username, password);
  cache.set(key, { uris, ts: now, ok: !!(uris.streamUri || uris.snapshotUri) });
  return uris;
}

// Best RTSP URL for a camera: ONVIF-discovered stream URI (preferred), else the configured URL.
// This is the key fix: the camera reports its real RTSP path instead of us guessing /stream1.
export async function resolveStreamUrl(cam: { ip: string; rtspUrl?: string; onvifPort?: number }): Promise<string> {
  const fallback = cam.rtspUrl || `rtsp://${cam.ip}:554/stream1?channel=1&subtype=0`;
  if (!cam.ip) return fallback;
  const { username, password } = parseRtspCreds(cam.rtspUrl);
  const port = cam.onvifPort || 8899;
  try {
    const { streamUri } = await getUris(cam.ip, port, username, password);
    if (streamUri) {
      console.log(`[ONVIF] ${cam.ip}: stream RTSP ditemukan ${maskUrl(streamUri)}`);
      return streamUri;
    }
    console.warn(`[ONVIF] ${cam.ip}: ONVIF gagal, pakai RTSP konfigurasi ${maskUrl(fallback)}`);
    return fallback;
  } catch {
    return fallback;
  }
}

// ONVIF-reported HTTP snapshot URL (with credentials), or null if unavailable.
export async function resolveSnapshotUrl(cam: { ip: string; rtspUrl?: string; onvifPort?: number }): Promise<string | null> {
  if (!cam.ip) return null;
  const { username, password } = parseRtspCreds(cam.rtspUrl);
  const port = cam.onvifPort || 8899;
  try {
    const { snapshotUri } = await getUris(cam.ip, port, username, password);
    return snapshotUri || null;
  } catch {
    return null;
  }
}
