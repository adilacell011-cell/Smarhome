import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { REC_DIR, THUMB_DIR, addRecording } from "./store";

export type Camera = { id: string; name: string; ip: string; rtspUrl: string };

const SEGMENT_SECONDS = 120; // length of each recorded clip

type RecState = {
  active: boolean;
  proc: ChildProcess | null;
  camera: Camera;
};

const sessions = new Map<string, RecState>();

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function camDir(cameraId: string): string {
  const dir = path.join(REC_DIR, safeId(cameraId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ffprobeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve(parseFloat(out.trim()) || 0));
    p.on("error", () => resolve(0));
  });
}

function makeThumb(videoFile: string, thumbFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", videoFile,
      "-frames:v", "1", "-q:v", "4",
      "-y", thumbFile,
    ]);
    p.on("close", (code) => resolve(code === 0 && fs.existsSync(thumbFile)));
    p.on("error", () => resolve(false));
  });
}

type Clip = {
  proc: ChildProcess;
  file: string;
  startTs: number;
  done: Promise<{ ok: boolean }>;
};

// Records one fixed-length clip; `done` resolves when ffmpeg exits.
function recordClip(camera: Camera, dir: string): Clip {
  const startTs = Date.now();
  const stamp = new Date(startTs).toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}.mp4`);

  const proc = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-rtsp_transport", "tcp",
    "-i", camera.rtspUrl,
    "-t", String(SEGMENT_SECONDS),
    "-c", "copy",
    "-movflags", "+faststart",
    "-y", file,
  ]);

  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));

  const done = new Promise<{ ok: boolean }>((resolve) => {
    proc.on("close", () => {
      const exists = fs.existsSync(file) && fs.statSync(file).size > 1024;
      if (!exists && stderr) console.error(`[NVR Rec] ${camera.id} ffmpeg: ${stderr.split("\n")[0]}`);
      resolve({ ok: exists });
    });
    proc.on("error", (err) => {
      console.error(`[NVR Rec] ${camera.id} gagal menjalankan ffmpeg:`, err.message);
      resolve({ ok: false });
    });
  });

  return { proc, file, startTs, done };
}

async function registerClip(camera: Camera, file: string, startTs: number) {
  try {
    const stat = fs.statSync(file);
    const duration = await ffprobeDuration(file);
    const base = path.basename(file, ".mp4");
    const thumbPath = path.join(THUMB_DIR, `rec_${safeId(camera.id)}_${base}.jpg`);
    const thumbOk = await makeThumb(file, thumbPath);
    addRecording({
      camera_id: camera.id,
      camera_name: camera.name,
      file,
      thumb: thumbOk ? thumbPath : null,
      start_ts: startTs,
      end_ts: Date.now(),
      duration,
      size: stat.size,
    });
    console.log(`[NVR Rec] Tersimpan ${path.basename(file)} (${(stat.size / 1e6).toFixed(1)}MB, ${duration.toFixed(0)}s)`);
  } catch (err) {
    console.error("[NVR Rec] Gagal mendaftarkan rekaman:", err);
  }
}

async function recordLoop(state: RecState) {
  const dir = camDir(state.camera.id);
  while (state.active) {
    const clip = recordClip(state.camera, dir);
    state.proc = clip.proc;
    const { ok } = await clip.done;
    if (ok) await registerClip(state.camera, clip.file, clip.startTs);
    else if (!state.active) break;
    else {
      // Camera unreachable mid-session: back off before retrying to avoid a hot loop
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  state.proc = null;
}

// Starts recording; resolves ok only once the first clip is confirmed writing (camera reachable).
export async function startRecording(camera: Camera): Promise<{ ok: boolean; message: string }> {
  const existing = sessions.get(camera.id);
  if (existing?.active) return { ok: true, message: "Sudah merekam" };

  const dir = camDir(camera.id);
  // Probe: start one clip and confirm ffmpeg stays alive (= camera reachable) before committing.
  const clip = recordClip(camera, dir);
  let earlyExit = false;
  const reachable = await Promise.race([
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 3000)),
    clip.done.then((r) => { earlyExit = true; return r.ok; }),
  ]);

  if (earlyExit && !reachable) {
    return {
      ok: false,
      message: `Tidak bisa terhubung ke kamera ${camera.name} (${camera.ip}). Pastikan RTSP benar dan kamera di jaringan yang sama.`,
    };
  }

  // Camera reachable: adopt this clip as the first segment of a live session.
  const state: RecState = { active: true, proc: clip.proc, camera };
  sessions.set(camera.id, state);

  clip.done.then(async (r) => {
    if (r.ok) await registerClip(camera, clip.file, clip.startTs);
    if (state.active) recordLoop(state);
  });

  return { ok: true, message: `Mulai merekam ${camera.name}` };
}

export function stopRecording(cameraId: string): { ok: boolean; message: string } {
  const state = sessions.get(cameraId);
  if (!state || !state.active) return { ok: false, message: "Tidak ada rekaman aktif" };
  state.active = false;
  if (state.proc) {
    try { state.proc.kill("SIGTERM"); } catch { /* noop */ }
  }
  sessions.delete(cameraId);
  return { ok: true, message: "Rekaman dihentikan" };
}

export function isRecording(cameraId: string): boolean {
  return !!sessions.get(cameraId)?.active;
}

export function recordingStatus(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, s] of sessions) out[id] = s.active;
  return out;
}

export function stopAllRecordings() {
  for (const id of Array.from(sessions.keys())) stopRecording(id);
}
