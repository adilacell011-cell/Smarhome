import fs from "fs";
import path from "path";
import dgram from "dgram";
import { execFile } from "child_process";

export type RuleAction = {
  deviceType: "wiz" | "tv";
  deviceId: string; // wiz: lamp id or "all"; tv: "tv"
  command: string;  // wiz: "on" | "off"; tv: "power" | "youtube" | "mute"
};

export type AutomationRule = {
  id: string;
  name?: string;
  enabled: boolean;
  cameraId: string; // "any" or a specific camera id
  label: string;    // "any" or a specific detection label (person, car, ...)
  action: RuleAction;
  cooldownSec: number;
};

// Time-based schedule: run an action at a fixed time on chosen days (e.g. lights on at 18:00).
export type Schedule = {
  id: string;
  name?: string;
  enabled: boolean;
  time: string;     // "HH:MM" 24h
  days: number[];   // 0..6 (0=Sun); empty = every day
  action: RuleAction;
};

type GetConfig = () => any;

const RULES_FILE = path.join(process.cwd(), "config", "automation-rules.json");
const SCHEDULES_FILE = path.join(process.cwd(), "config", "light-schedules.json");

let getConfig: GetConfig = () => ({});
let rules: AutomationRule[] = [];
let schedules: Schedule[] = [];
const lastFired = new Map<string, number>(); // ruleId -> ts
const schedLastFired = new Map<string, string>(); // scheduleId -> minute key
let schedTimer: ReturnType<typeof setInterval> | null = null;

// Atomic write: temp file + fsync + rename, so a crash mid-write cannot truncate the file.
export function atomicWriteJson(file: string, data: any) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// Returns the parsed array, or null if the file is missing/corrupt (caller keeps last-known-good).
export function loadJsonArray(file: string): any[] | null {
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.error(`[NVR Auto] Gagal memuat ${path.basename(file)} (file mungkin rusak, mempertahankan yang lama):`, err);
    return null;
  }
}

export function initAutomation(cfgGetter: GetConfig) {
  getConfig = cfgGetter;
  const r = loadJsonArray(RULES_FILE);
  if (r) rules = r;
  const s = loadJsonArray(SCHEDULES_FILE);
  if (s) schedules = s;
  if (schedTimer) clearInterval(schedTimer);
  // Check every 20s; each matching minute fires at most once (guarded by schedLastFired).
  schedTimer = setInterval(tickSchedules, 20000);
  console.log(`[NVR Auto] ${rules.length} aturan otomatis & ${schedules.length} jadwal lampu dimuat`);
}

export function listRules(): AutomationRule[] {
  return rules;
}

const WIZ_CMDS = new Set(["on", "off"]);
const TV_CMDS = new Set(["power", "youtube", "mute", "home"]);
const MAX_RULES = 50;
const MAX_SCHEDULES = 50;

function validAction(a: any): a is RuleAction {
  if (!a || typeof a.deviceId !== "string") return false;
  if (a.deviceType === "wiz") return WIZ_CMDS.has(a.command);
  if (a.deviceType === "tv") return TV_CMDS.has(a.command);
  return false;
}

function validRule(r: any): r is AutomationRule {
  return !!r && typeof r.id === "string" && validAction(r.action);
}

// Replace the full rule list (the UI sends the complete set). Fail-closed: if any item is
// invalid or the count is exceeded, reject the whole batch (returns null) WITHOUT overwriting
// the existing rules — otherwise one malformed payload could silently wipe all rules.
export function saveRules(next: AutomationRule[]): AutomationRule[] | null {
  const arr = Array.isArray(next) ? next : [];
  if (arr.length > MAX_RULES || !arr.every(validRule)) return null;
  rules = arr.map((r) => ({
    id: r.id,
    name: typeof r.name === "string" ? r.name.slice(0, 80) : undefined,
    enabled: !!r.enabled,
    cameraId: typeof r.cameraId === "string" ? r.cameraId : "any",
    label: typeof r.label === "string" ? r.label : "any",
    action: { deviceType: r.action.deviceType, deviceId: r.action.deviceId, command: r.action.command },
    cooldownSec: Math.max(0, Math.min(3600, Number(r.cooldownSec) || 0)),
  }));
  atomicWriteJson(RULES_FILE, rules);
  return rules;
}

export function deleteRule(id: string): boolean {
  const before = rules.length;
  rules = rules.filter((r) => r.id !== id);
  if (rules.length !== before) { atomicWriteJson(RULES_FILE, rules); return true; }
  return false;
}

// ---- Time-based light schedules ----

function validSchedule(s: any): s is Schedule {
  if (!s || typeof s.id !== "string" || !validAction(s.action)) return false;
  if (typeof s.time !== "string" || !/^\d{2}:\d{2}$/.test(s.time)) return false;
  const [h, m] = s.time.split(":").map(Number);
  return h <= 23 && m <= 59;
}

export function listSchedules(): Schedule[] {
  return schedules;
}

// Fail-closed like saveRules: reject the whole batch (returns null) without overwriting
// existing schedules if any item is invalid, so a malformed payload can't wipe schedules.
export function saveSchedules(next: Schedule[]): Schedule[] | null {
  const arr = Array.isArray(next) ? next : [];
  if (arr.length > MAX_SCHEDULES || !arr.every(validSchedule)) return null;
  schedules = arr.map((s) => ({
    id: s.id,
    name: typeof s.name === "string" ? s.name.slice(0, 80) : undefined,
    enabled: !!s.enabled,
    time: s.time,
    days: Array.isArray(s.days) ? s.days.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    action: { deviceType: s.action.deviceType, deviceId: s.action.deviceId, command: s.action.command },
  }));
  atomicWriteJson(SCHEDULES_FILE, schedules);
  return schedules;
}

export function deleteSchedule(id: string): boolean {
  const before = schedules.length;
  schedules = schedules.filter((s) => s.id !== id);
  if (schedules.length !== before) { atomicWriteJson(SCHEDULES_FILE, schedules); return true; }
  return false;
}

// Runs on an interval; fires any schedule whose time/day matches the current minute, once per minute.
function tickSchedules() {
  const now = new Date();
  const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const day = now.getDay();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${cur}`;
  for (const s of schedules) {
    if (!s.enabled || s.time !== cur) continue;
    if (s.days.length > 0 && !s.days.includes(day)) continue;
    if (schedLastFired.get(s.id) === minuteKey) continue;
    schedLastFired.set(s.id, minuteKey);
    runAction(s.action)
      .then((res) => console.log(`[NVR Sched] Jadwal "${s.name || s.id}" (${cur}): ${res.detail}`))
      .catch((err) => console.error(`[NVR Sched] Jadwal "${s.name || s.id}" gagal:`, err));
  }
}

// ---- Device control ----

function sendWizPilot(ip: string, port: number, params: Record<string, any>): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const msg = Buffer.from(JSON.stringify({ method: "setPilot", params }));
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return; done = true;
      try { socket.close(); } catch { /* noop */ }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(true), 1200); // WiZ is fire-and-forget; assume ok
    socket.on("message", () => { clearTimeout(timer); finish(true); });
    socket.on("error", () => { clearTimeout(timer); finish(false); });
    socket.send(msg, 0, msg.length, port, ip, (err) => { if (err) { clearTimeout(timer); finish(false); } });
  });
}

// Strict IP[:port] validation so a crafted tvIp can never reach a shell.
function parseTvAddr(raw: any): string | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/.exec(raw.trim());
  if (!m) return null;
  if ([m[1], m[2], m[3], m[4]].some((o) => parseInt(o) > 255)) return null;
  if (m[5] && parseInt(m[5]) > 65535) return null;
  return raw.trim();
}

// Run adb via execFile with an argument array — no shell, so arguments cannot be injected.
function runAdb(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("adb", args, { timeout: 8000 }, (err) => resolve(!err));
  });
}

async function controlWiz(deviceId: string, command: string): Promise<{ ok: boolean; detail: string }> {
  const cfg = getConfig();
  const lamps: any[] = cfg.wizLamps && cfg.wizLamps.length
    ? cfg.wizLamps
    : (cfg.wizIp ? [{ id: "wiz", name: cfg.wizName || "Lampu", ip: cfg.wizIp, port: cfg.wizPort }] : []);

  const targets = deviceId === "all" ? lamps : lamps.filter((l) => l.id === deviceId);
  if (targets.length === 0) return { ok: false, detail: "Lampu tidak ditemukan di konfigurasi" };

  const params = command === "off" ? { state: false } : { state: true };
  let okCount = 0;
  for (const l of targets) {
    const ok = await sendWizPilot(l.ip, parseInt(l.port) || 38899, params);
    if (ok) okCount++;
  }
  return { ok: okCount > 0, detail: `${okCount}/${targets.length} lampu di-${command === "off" ? "matikan" : "nyalakan"}` };
}

async function controlTv(command: string): Promise<{ ok: boolean; detail: string }> {
  const cfg = getConfig();
  const ip = parseTvAddr(cfg.tvIp);
  if (!ip) return { ok: false, detail: "IP TV tidak diatur / format tidak valid" };

  const keymap: Record<string, string> = {
    power: "KEYCODE_POWER", mute: "KEYCODE_MUTE", home: "KEYCODE_HOME",
  };

  const connected = await runAdb(["connect", ip]);
  if (!connected) return { ok: false, detail: "Gagal terhubung ke TV (adb connect)" };

  let ok: boolean;
  if (command === "youtube") {
    ok = await runAdb(["-s", ip, "shell", "am", "start", "-n", "com.google.android.youtube.tv/.MainActivity"]);
  } else {
    const key = keymap[command] || "KEYCODE_POWER";
    ok = await runAdb(["-s", ip, "shell", "input", "keyevent", key]);
  }
  return { ok, detail: ok ? `TV: ${command}` : "Gagal mengirim perintah ke TV" };
}

export async function runAction(action: RuleAction): Promise<{ ok: boolean; detail: string }> {
  if (action.deviceType === "wiz") return controlWiz(action.deviceId, action.command);
  if (action.deviceType === "tv") return controlTv(action.command);
  return { ok: false, detail: "Tipe perangkat tidak dikenal" };
}

// Called by the detector whenever a relevant object is detected.
export function onDetection(cameraId: string, label: string) {
  const now = Date.now();
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.cameraId !== "any" && r.cameraId !== cameraId) continue;
    if (r.label !== "any" && r.label !== label) continue;

    const cd = (r.cooldownSec || 0) * 1000;
    if (now - (lastFired.get(r.id) || 0) < cd) continue;
    lastFired.set(r.id, now);

    runAction(r.action)
      .then((res) => console.log(`[NVR Auto] Aturan "${r.name || r.id}" terpicu (${label}@${cameraId}): ${res.detail}`))
      .catch((err) => console.error(`[NVR Auto] Aturan "${r.name || r.id}" gagal:`, err));
  }
}
