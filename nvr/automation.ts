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

type GetConfig = () => any;

const RULES_FILE = path.join(process.cwd(), "config", "automation-rules.json");

let getConfig: GetConfig = () => ({});
let rules: AutomationRule[] = [];
const lastFired = new Map<string, number>(); // ruleId -> ts

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RULES_FILE, "utf-8"));
      // Only adopt valid content; on a corrupt/partial file keep the last-known-good
      // (empty on first boot) rather than silently behaving as if there are no rules.
      if (Array.isArray(parsed)) rules = parsed;
      else console.error("[NVR Auto] File aturan bukan array, diabaikan");
    }
  } catch (err) {
    console.error("[NVR Auto] Gagal memuat aturan (file mungkin rusak, mempertahankan yang lama):", err);
  }
}

// Atomic write: temp file + fsync + rename, so a crash mid-write cannot truncate the file.
function saveRulesFile() {
  try {
    fs.mkdirSync(path.dirname(RULES_FILE), { recursive: true });
    const tmp = `${RULES_FILE}.tmp`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, JSON.stringify(rules, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, RULES_FILE);
  } catch (err) {
    console.error("[NVR Auto] Gagal menyimpan aturan:", err);
  }
}

export function initAutomation(cfgGetter: GetConfig) {
  getConfig = cfgGetter;
  loadRules();
  console.log(`[NVR Auto] ${rules.length} aturan otomatis dimuat`);
}

export function listRules(): AutomationRule[] {
  return rules;
}

const WIZ_CMDS = new Set(["on", "off"]);
const TV_CMDS = new Set(["power", "youtube", "mute", "home"]);
const MAX_RULES = 50;

function validRule(r: any): r is AutomationRule {
  if (!r || typeof r.id !== "string" || !r.action) return false;
  const a = r.action;
  if (a.deviceType === "wiz") { if (!WIZ_CMDS.has(a.command)) return false; }
  else if (a.deviceType === "tv") { if (!TV_CMDS.has(a.command)) return false; }
  else return false;
  if (typeof a.deviceId !== "string") return false;
  return true;
}

// Replace the full rule list (the UI sends the complete set). Sanitises each rule and
// bounds the total count to prevent trigger amplification.
export function saveRules(next: AutomationRule[]): AutomationRule[] {
  rules = (next || [])
    .filter(validRule)
    .slice(0, MAX_RULES)
    .map((r) => ({
      id: r.id,
      name: typeof r.name === "string" ? r.name.slice(0, 80) : undefined,
      enabled: !!r.enabled,
      cameraId: typeof r.cameraId === "string" ? r.cameraId : "any",
      label: typeof r.label === "string" ? r.label : "any",
      action: { deviceType: r.action.deviceType, deviceId: r.action.deviceId, command: r.action.command },
      cooldownSec: Math.max(0, Math.min(3600, Number(r.cooldownSec) || 0)),
    }));
  saveRulesFile();
  return rules;
}

export function deleteRule(id: string): boolean {
  const before = rules.length;
  rules = rules.filter((r) => r.id !== id);
  if (rules.length !== before) { saveRulesFile(); return true; }
  return false;
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
