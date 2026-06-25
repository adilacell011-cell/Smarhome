import path from "path";
import { atomicWriteJson, loadJsonArray } from "./automation";
import { grabFrame } from "./detector";

export type SnapSchedule = {
  id: string;
  name?: string;
  enabled: boolean;
  time: string;    // "HH:MM" 24h
  days: number[];  // 0..6 (0=Sun); empty = every day
  cameraId: string; // a specific camera id or "all"
};

type GetConfig = () => any;

const SCHEDULES_FILE = path.join(process.cwd(), "config", "telegram-schedules.json");
const MAX_SCHEDULES = 50;

let getConfig: GetConfig = () => ({});
let schedules: SnapSchedule[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
const lastFired = new Map<string, string>(); // scheduleId -> minute key
const running = new Set<string>(); // scheduleIds with a snapshot job in flight (avoid pile-up)

function normalize(s: any): SnapSchedule {
  return {
    id: s.id,
    name: typeof s.name === "string" ? s.name.slice(0, 80) : undefined,
    enabled: !!s.enabled,
    time: s.time,
    days: Array.isArray(s.days) ? s.days.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    cameraId: s.cameraId,
  };
}

export function initTelegram(cfgGetter: GetConfig) {
  getConfig = cfgGetter;
  const s = loadJsonArray(SCHEDULES_FILE);
  // Sanitize on load too: drop malformed on-disk entries so the scheduler can't throw at runtime.
  if (s) schedules = s.filter(validSchedule).map(normalize);
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 20000);
  console.log(`[NVR TG] ${schedules.length} jadwal snapshot Telegram dimuat`);
}

export function isConfigured(): boolean {
  const cfg = getConfig();
  return !!(cfg.telegramBotToken && cfg.telegramChatId);
}

function validSchedule(s: any): s is SnapSchedule {
  if (!s || typeof s.id !== "string" || typeof s.cameraId !== "string") return false;
  if (typeof s.time !== "string" || !/^\d{2}:\d{2}$/.test(s.time)) return false;
  const [h, m] = s.time.split(":").map(Number);
  return h <= 23 && m <= 59;
}

export function listSchedules(): SnapSchedule[] {
  return schedules;
}

// Fail-closed: reject the whole batch (returns null) without overwriting if any item is invalid.
export function saveSchedules(next: SnapSchedule[]): SnapSchedule[] | null {
  const arr = Array.isArray(next) ? next : [];
  if (arr.length > MAX_SCHEDULES || !arr.every(validSchedule)) return null;
  schedules = arr.map(normalize);
  atomicWriteJson(SCHEDULES_FILE, schedules);
  return schedules;
}

export function deleteSchedule(id: string): boolean {
  const before = schedules.length;
  schedules = schedules.filter((s) => s.id !== id);
  if (schedules.length !== before) { atomicWriteJson(SCHEDULES_FILE, schedules); return true; }
  return false;
}

// Resolve cameras from live config; mirrors nvr/index.ts resolveCamera (never fabricates ids).
function resolveCameras(cameraId: string): { id: string; name: string; rtspUrl: string }[] {
  const cfg = getConfig();
  const all: { id: string; name: string; rtspUrl: string }[] = (cfg.cctvs && cfg.cctvs.length)
    ? cfg.cctvs.map((c: any) => ({ id: c.id, name: c.name, rtspUrl: c.rtspUrl }))
    : (cfg.icseeIp
      ? [{ id: "icsee", name: cfg.icseeName || "CCTV", rtspUrl: cfg.icseeRtspUrl || `rtsp://${cfg.icseeIp}:554/stream1?channel=1&subtype=0` }]
      : []);
  if (cameraId === "all") return all;
  return all.filter((c) => c.id === cameraId);
}

// Send a single JPEG buffer to the configured admin chat via the Telegram Bot API.
async function sendPhoto(buffer: Buffer, caption: string): Promise<{ ok: boolean; detail: string }> {
  const cfg = getConfig();
  const token = cfg.telegramBotToken;
  const chatId = cfg.telegramChatId;
  if (!token || !chatId) return { ok: false, detail: "Token bot / Chat ID Telegram belum diatur" };

  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    form.append("photo", new Blob([buffer], { type: "image/jpeg" }), "snapshot.jpg");
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
    const data: any = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) return { ok: true, detail: "Foto terkirim ke Telegram" };
    return { ok: false, detail: `Telegram menolak: ${data.description || resp.status}` };
  } catch (err: any) {
    return { ok: false, detail: `Gagal menghubungi Telegram: ${err?.message || "error"}` };
  }
}

// Capture a snapshot from the given camera(s) and send each to Telegram.
export async function sendSnapshotNow(cameraId: string): Promise<{ ok: boolean; detail: string }> {
  if (!isConfigured()) return { ok: false, detail: "Token bot / Chat ID Telegram belum diatur" };
  const cams = resolveCameras(cameraId);
  if (cams.length === 0) return { ok: false, detail: "Kamera tidak ditemukan di konfigurasi" };

  let okCount = 0;
  let lastDetail = "";
  for (const cam of cams) {
    const frame = await grabFrame(cam.rtspUrl);
    if (!frame) { lastDetail = `Gagal mengambil gambar dari ${cam.name}`; continue; }
    const ts = new Date().toLocaleString("id-ID");
    const res = await sendPhoto(frame, `${cam.name} • ${ts}`);
    if (res.ok) okCount++;
    else lastDetail = res.detail;
  }
  if (okCount === cams.length) return { ok: true, detail: `${okCount} foto terkirim ke Telegram` };
  if (okCount > 0) return { ok: true, detail: `${okCount}/${cams.length} foto terkirim (${lastDetail})` };
  return { ok: false, detail: lastDetail || "Tidak ada foto yang terkirim" };
}

function tick() {
  if (schedules.length === 0) return;
  const now = new Date();
  const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const day = now.getDay();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${cur}`;
  for (const s of schedules) {
    if (!s.enabled || s.time !== cur) continue;
    if (s.days.length > 0 && !s.days.includes(day)) continue;
    if (lastFired.get(s.id) === minuteKey) continue;
    if (running.has(s.id)) continue; // previous run still in flight (slow/unreachable camera) — skip
    lastFired.set(s.id, minuteKey);
    running.add(s.id);
    sendSnapshotNow(s.cameraId)
      .then((res) => console.log(`[NVR TG] Jadwal "${s.name || s.id}" (${cur}): ${res.detail}`))
      .catch((err) => console.error(`[NVR TG] Jadwal "${s.name || s.id}" gagal:`, err))
      .finally(() => running.delete(s.id));
  }
}
