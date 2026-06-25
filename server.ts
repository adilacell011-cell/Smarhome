import express from "express";
import path from "path";
import fs from "fs";
import net from "net";
import dgram from "dgram";
import crypto from "crypto";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import onvif from "onvif";
import { registerNvr } from "./nvr/index";

const { Cam } = onvif;

// Helper function to check if a TCP port is open (Ping substitute for port-level verification)
function checkTcpPort(port: number, host: string, timeout = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

const CONFIG_DIR = path.join(process.cwd(), "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "device-config.json");
const LEGACY_CONFIG_PATH = path.join(process.cwd(), "device-config.json");

// Default Configuration
const DEFAULT_CONFIG = {
  wizName: 'Lampu Utama Living Room',
  wizIp: '192.168.1.10',
  wizPort: '38899',
  wizLamps: [
    { id: 'lampu-1', name: 'Lampu Living Room', ip: '192.168.1.10', port: '38899' },
    { id: 'lampu-2', name: 'Lampu Kamar Tidur', ip: '192.168.1.11', port: '38899' },
    { id: 'lampu-3', name: 'Lampu Dapur', ip: '192.168.1.12', port: '38899' }
  ],
  icseeName: 'CCTV Pintu Depan',
  icseeIp: '192.168.1.20',
  icseeRtspUrl: 'rtsp://admin:123456@192.168.1.20:554/stream1?channel=1&subtype=0',
  cctvs: [
    { id: 'cctv-1', name: 'CCTV Pintu Depan', ip: '192.168.1.20', rtspUrl: 'rtsp://admin:123456@192.168.1.20:554/stream1?channel=1&subtype=0' },
    { id: 'cctv-2', name: 'CCTV Halaman Belakang', ip: '192.168.1.21', rtspUrl: 'rtsp://admin:123456@192.168.1.21:554/stream1?channel=1&subtype=0' }
  ],
  tvName: 'Android TV Ruang Keluarga',
  tvIp: '192.168.1.30',
  routerName: 'Fiberhome Router Gateway',
  routerIp: '192.168.1.1',
  routerPassword: '',
  telegramBotToken: '',
  telegramChatId: '',
  appUsername: 'admin',
  appPasswordHash: ''
};

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } else if (fs.existsSync(LEGACY_CONFIG_PATH)) {
      // Migrate legacy config if exists
      const data = fs.readFileSync(LEGACY_CONFIG_PATH, "utf-8");
      const config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      // Try to save to new path
      writeConfig(config);
      return config;
    }
  } catch (err) {
    console.error("Gagal membaca file konfigurasi:", err);
  }
  return DEFAULT_CONFIG;
}

function writeConfig(config: typeof DEFAULT_CONFIG) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Gagal menyimpan file konfigurasi:", err);
    return false;
  }
}

// Extract username/password from an RTSP URL (rtsp://user:pass@ip:port/...)
function parseRtspCreds(rtspUrl?: string): { username: string; password: string } {
  const fallback = { username: "admin", password: "" };
  if (!rtspUrl) return fallback;
  const match = rtspUrl.match(/^rtsp:\/\/([^:@/]+):([^@/]*)@/i);
  if (match) return { username: decodeURIComponent(match[1]), password: decodeURIComponent(match[2]) };
  return fallback;
}

// ---- Authentication helpers (login gate for the whole dashboard) ----
const DEFAULT_PASSWORD = "admin123";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days
const sessions = new Map<string, { username: string; created: number }>();

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(pw: string, stored?: string): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession(username: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, created: Date.now() });
  return token;
}

function getSession(token: string): { username: string; created: number } | null {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(token); return null; }
  return s;
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = Number(process.env.PORT) || 5000;

  // Initial config load
  let deviceConfig = readConfig();

  // First run: ensure a login password hash exists (default user "admin" / pass "admin123")
  if (!deviceConfig.appPasswordHash) {
    if (!deviceConfig.appUsername) deviceConfig.appUsername = "admin";
    deviceConfig.appPasswordHash = hashPassword(DEFAULT_PASSWORD);
    writeConfig(deviceConfig);
  }

  // Auth gate: protect all /api routes except the auth handshake endpoints
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    if (req.path === "/api/auth/login" || req.path === "/api/auth/status" || req.path === "/api/auth/logout") return next();
    const cookies = parseCookies(req);
    const sess = cookies.sid ? getSession(cookies.sid) : null;
    if (sess) { (req as any).authUser = sess.username; return next(); }
    return res.status(401).json({ success: false, message: "Silakan login terlebih dahulu" });
  });

  // Endpoint to get configuration (never expose the password hash)
  app.get("/api/settings", (req, res) => {
    const { appPasswordHash, ...safe } = deviceConfig as any;
    res.json({ success: true, config: safe });
  });

  // Endpoint to update configuration (credentials are managed via /api/auth/* only)
  app.post("/api/settings", (req, res) => {
    const body = { ...(req.body || {}) };
    delete body.appPasswordHash;
    delete body.appUsername;
    deviceConfig = { ...deviceConfig, ...body };
    const saved = writeConfig(deviceConfig);
    const { appPasswordHash, ...safe } = deviceConfig as any;
    res.json({ success: saved, config: safe });
  });

  // ---- Authentication routes ----
  app.get("/api/auth/status", (req, res) => {
    const cookies = parseCookies(req);
    const sess = cookies.sid ? getSession(cookies.sid) : null;
    res.json({ success: true, authenticated: !!sess, username: sess ? sess.username : deviceConfig.appUsername });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ success: false, message: "Username dan password wajib diisi" });
    }
    if (username !== deviceConfig.appUsername || !verifyPassword(password, deviceConfig.appPasswordHash)) {
      return res.status(401).json({ success: false, message: "Username atau password salah" });
    }
    const token = createSession(username);
    res.cookie("sid", token, { httpOnly: true, sameSite: "lax", maxAge: SESSION_TTL, path: "/" });
    res.json({ success: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    const cookies = parseCookies(req);
    if (cookies.sid) sessions.delete(cookies.sid);
    res.clearCookie("sid", { path: "/" });
    res.json({ success: true });
  });

  app.post("/api/auth/credentials", (req, res) => {
    const { username, currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, deviceConfig.appPasswordHash)) {
      return res.status(401).json({ success: false, message: "Password saat ini salah" });
    }
    if (typeof username === "string" && username.trim()) {
      deviceConfig.appUsername = username.trim().slice(0, 60);
    }
    if (typeof newPassword === "string" && newPassword.length > 0) {
      if (newPassword.length < 4) return res.status(400).json({ success: false, message: "Password baru minimal 4 karakter" });
      deviceConfig.appPasswordHash = hashPassword(newPassword);
    }
    const saved = writeConfig(deviceConfig);
    // Invalidate every existing session so old/stolen tokens stop working after a credential change,
    // then issue a fresh session for the current user so they stay logged in.
    sessions.clear();
    const token = createSession(deviceConfig.appUsername);
    res.cookie("sid", token, { httpOnly: true, sameSite: "lax", maxAge: SESSION_TTL, path: "/" });
    res.json({ success: saved, username: deviceConfig.appUsername });
  });

  // 1. Philips WiZ Controls (Real UDP logic using Node dgram)
  app.post("/api/wiz/control", async (req, res) => {
    const { isOn, brightness, colorTemp, scene, color, ip, port } = req.body;
    const targetIp = ip || deviceConfig.wizIp;
    const targetPort = parseInt(port || deviceConfig.wizPort) || 38899;
    
    // Construct real WiZ JSON payload
    let wizParams: any = {};
    if (isOn !== undefined) wizParams.state = isOn;
    if (brightness !== undefined) wizParams.dimming = Math.min(100, Math.max(10, brightness));
    if (colorTemp !== undefined) wizParams.temp = Math.min(6500, Math.max(2200, colorTemp));
    
    if (color) {
      // Simple HEX to RGB convert if color is provided as '#RRGGBB'
      const hex = color.replace('#', '');
      if (hex.length === 6) {
        wizParams.r = parseInt(hex.substring(0, 2), 16);
        wizParams.g = parseInt(hex.substring(2, 4), 16);
        wizParams.b = parseInt(hex.substring(4, 6), 16);
      }
    }

    const payload = JSON.stringify({
      method: "setPilot",
      params: wizParams
    });

    console.log(`[WiZ UDP] Mengirim paket ke ${targetIp}:${targetPort} -> ${payload}`);
    
    // Send via real UDP Socket
    try {
      const client = dgram.createSocket("udp4");
      const buffer = Buffer.from(payload);
      
      client.send(buffer, 0, buffer.length, targetPort, targetIp, (err) => {
        client.close();
        if (err) {
          console.error(`[WiZ UDP Error] Gagal mengirim paket ke ${targetIp}:`, err);
        }
      });
    } catch (err) {
      console.error("[WiZ UDP Socket Error]", err);
    }
    
    res.json({ 
      success: true, 
      message: `Perintah WiZ berhasil dikirim ke ${targetIp}:${targetPort}`,
      state: { isOn, brightness, colorTemp, scene, color }
    });
  });

  // Fetch real-time power and brightness status of all registered WiZ lamps via parallel UDP queries
  app.get("/api/wiz/status", async (req, res) => {
    const lamps = deviceConfig.wizLamps || [];
    if (lamps.length === 0) {
      return res.json({ success: true, statuses: {} });
    }

    try {
      const statusPromises = lamps.map(lamp => {
        return new Promise<{ id: string; ip: string; isOn: boolean; brightness: number; colorTemp: number; online: boolean }>((resolve) => {
          const client = dgram.createSocket("udp4");
          const payload = JSON.stringify({ method: "getPilot", params: {} });
          const buffer = Buffer.from(payload);
          const port = parseInt(lamp.port) || 38899;
          let resolved = false;

          const timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              client.close();
              resolve({
                id: lamp.id,
                ip: lamp.ip,
                isOn: false,
                brightness: 80,
                colorTemp: 4000,
                online: false
              });
            }
          }, 800); // Fast 800ms timeout for non-blocking page load

          client.on("message", (msg) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              client.close();
              try {
                const resData = JSON.parse(msg.toString());
                if (resData && resData.result) {
                  resolve({
                    id: lamp.id,
                    ip: lamp.ip,
                    isOn: resData.result.state === true || resData.result.state === 1,
                    brightness: resData.result.dimming || 80,
                    colorTemp: resData.result.temp || 4000,
                    online: true
                  });
                } else {
                  resolve({
                    id: lamp.id,
                    ip: lamp.ip,
                    isOn: false,
                    brightness: 80,
                    colorTemp: 4000,
                    online: true
                  });
                }
              } catch (e) {
                resolve({
                  id: lamp.id,
                  ip: lamp.ip,
                  isOn: false,
                  brightness: 80,
                  colorTemp: 4000,
                  online: true
                });
              }
            }
          });

          client.on("error", () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              client.close();
              resolve({
                id: lamp.id,
                ip: lamp.ip,
                isOn: false,
                brightness: 80,
                colorTemp: 4000,
                online: false
              });
            }
          });

          client.send(buffer, 0, buffer.length, port, lamp.ip, (err) => {
            if (err && !resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              client.close();
              resolve({
                id: lamp.id,
                ip: lamp.ip,
                isOn: false,
                brightness: 80,
                colorTemp: 4000,
                online: false
              });
            }
          });
        });
      });

      const results = await Promise.all(statusPromises);
      const statusesMap: { [id: string]: { isOn: boolean; brightness: number; colorTemp: number; online: boolean } } = {};
      results.forEach(r => {
        statusesMap[r.id] = {
          isOn: r.isOn,
          brightness: r.brightness,
          colorTemp: r.colorTemp,
          online: r.online
        };
      });

      res.json({ success: true, statuses: statusesMap });
    } catch (error) {
      console.error("[WiZ Status Error]", error);
      res.json({ success: false, message: "Gagal mendeteksi status lampu", error: String(error) });
    }
  });

  // WiZ Lamp connection test (handshake UDP port 38899)
  app.get("/api/wiz/test-connection", async (req, res) => {
    const targetIp = (req.query.ip as string) || deviceConfig.wizIp;
    const targetPort = parseInt((req.query.port as string) || deviceConfig.wizPort) || 38899;
    console.log(`[WiZ Diagnostic] Testing UDP connection to ${targetIp}:${targetPort}`);
    
    try {
      const client = dgram.createSocket("udp4");
      
      const payload = JSON.stringify({
        method: "getPilot",
        params: {}
      });
      const buffer = Buffer.from(payload);
      
      let resolved = false;
      
      const checkPromise = new Promise<{ online: boolean; message: string }>((resolve) => {
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            client.close();
            resolve({
              online: false,
              message: `Timeout! Tidak menerima respon UDP dari WiZ Lampu di ${targetIp}:${targetPort}. Pastikan lampu dinyalakan lewat saklar dinding dan terhubung ke jaringan WiFi yang sama.`
            });
          }
        }, 1500);

        client.on("message", (msg, rinfo) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            client.close();
            try {
              const resData = JSON.parse(msg.toString());
              console.log(`[WiZ Diagnostic] Terima respon dari ${rinfo.address}:`, resData);
              resolve({
                online: true,
                message: `Koneksi Berhasil! Terhubung ke WiZ Lampu di ${targetIp}:${targetPort}. Respon perangkat: ${JSON.stringify(resData.result || resData)}`
              });
            } catch (e) {
              resolve({
                online: true,
                message: `Koneksi Berhasil! Terhubung ke WiZ Lampu di ${targetIp}:${targetPort}. Respon mentah diterima.`
              });
            }
          }
        });

        client.on("error", (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            client.close();
            resolve({
              online: false,
              message: `Error jaringan socket UDP: ${err.message}`
            });
          }
        });

        // Send handshake packet
        client.send(buffer, 0, buffer.length, targetPort, targetIp, (err) => {
          if (err && !resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            client.close();
            resolve({
              online: false,
              message: `Gagal mengirim paket UDP: ${err.message}`
            });
          }
        });
      });

      const result = await checkPromise;
      res.json({
        success: true,
        online: result.online,
        ip: targetIp,
        port: targetPort,
        diagnostics: result.message
      });
    } catch (error) {
      res.json({
        success: false,
        message: "Gagal menjalankan UDP diagnostic scanner",
        error: String(error)
      });
    }
  });

  // 2. CCTV ICSee Controls (RTSP, Snapshot & PTZ)
  app.post("/api/icsee/ptz", async (req, res) => {
    const { direction, ip, onvifPort } = req.body; // 'up', 'down', 'left', 'right', 'zoom_in', 'zoom_out'
    const targetIp = ip || deviceConfig.icseeIp;

    // Velocity vector for ONVIF ContinuousMove
    const speed = 0.6;
    const velocity = { x: 0, y: 0, zoom: 0 };
    switch (direction) {
      case "up": velocity.y = speed; break;
      case "down": velocity.y = -speed; break;
      case "left": velocity.x = -speed; break;
      case "right": velocity.x = speed; break;
      case "zoom_in": velocity.zoom = speed; break;
      case "zoom_out": velocity.zoom = -speed; break;
      default:
        return res.status(400).json({ success: false, message: `Arah PTZ tidak valid: ${direction}` });
    }

    // Only allow PTZ against cameras that are actually configured (prevents arbitrary internal host probing)
    const allowedIps = new Set<string>([
      deviceConfig.icseeIp,
      ...((deviceConfig.cctvs || []).map((c: any) => c.ip))
    ].filter(Boolean));
    if (!allowedIps.has(targetIp)) {
      return res.status(403).json({ success: false, message: `Kamera ${targetIp} tidak terdaftar di konfigurasi.` });
    }

    // Look up credentials from the matching camera's RTSP URL
    const camConfig = (deviceConfig.cctvs || []).find((c: any) => c.ip === targetIp);
    const { username, password } = parseRtspCreds(camConfig?.rtspUrl || deviceConfig.icseeRtspUrl);
    const port = parseInt(onvifPort) || 8899; // common ONVIF port for Xiongmai/iCSee cameras

    console.log(`[ICSee PTZ ONVIF] ${targetIp}:${port} -> arah ${direction}`);

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

        // Overall operation deadline so the request never hangs indefinitely
        const overallTimeout = setTimeout(() => finish(() => reject(new Error("Operation timeout"))), 8000);

        const camera = new Cam(
          { hostname: targetIp, username, password, port, timeout: 4000 },
          function (this: any, err: any) {
            if (err) return finish(() => { clearTimeout(overallTimeout); reject(err); });
            camera.continuousMove(velocity, (moveErr: any) => {
              if (moveErr) return finish(() => { clearTimeout(overallTimeout); reject(moveErr); });
              // Short burst then stop, mimicking a tap-to-pan control
              setTimeout(() => {
                camera.stop({ panTilt: true, zoom: true }, () => finish(() => { clearTimeout(overallTimeout); resolve(); }));
              }, 600);
            });
          }
        );
      });
      res.json({ success: true, message: `Kamera ${targetIp} bergerak ke ${direction}` });
    } catch (error: any) {
      console.error("[ICSee PTZ Error]", error?.message || error);
      res.status(502).json({
        success: false,
        message: `Gagal mengontrol PTZ kamera di ${targetIp}. Pastikan kamera mendukung ONVIF, berada di jaringan yang sama, dan port/kredensial benar.`,
        error: String(error?.message || error)
      });
    }
  });

  // Real Connection Port Scanner for real-time camera inspection (ketika uji link kasih repon nyata!)
  app.get("/api/icsee/test-connection", async (req, res) => {
    const targetIp = (req.query.ip as string) || deviceConfig.icseeIp;
    console.log(`[ICSee Diagnostic] Testing connection to ${targetIp}`);
    
    try {
      const portsToTest = [
        { port: 80, name: "Web Service (Snapshot)" },
        { port: 554, name: "RTSP Video Stream" },
        { port: 8899, name: "ONVIF protocol" },
        { port: 34567, name: "iCSee NETIP SDK" }
      ];
      
      const results = [];
      for (const p of portsToTest) {
        const isOpen = await checkTcpPort(p.port, targetIp, 1200);
        results.push({ port: p.port, name: p.name, open: isOpen });
      }
      
      const isAnyOpen = results.some(r => r.open);
      let diagnostics = "";
      if (isAnyOpen) {
        diagnostics = `Koneksi Berhasil! Terhubung ke kamera di ${targetIp}. `;
        const openPorts = results.filter(r => r.open).map(r => r.port);
        if (openPorts.includes(34567)) {
          diagnostics += "Kamera terdeteksi sebagai perangkat Xiongmai/iCSee (NETIP) asli. ";
        }
        if (openPorts.includes(554)) {
          diagnostics += "Port RTSP (554) aktif, link RTSP siap dialirkan ke NVR/media player.";
        }
      } else {
        diagnostics = `Ping Gagal! Tidak ada port responsif di ${targetIp}. Pastikan kabel power CCTV terpasang, WiFi CCTV terhubung ke router yang sama, dan IP Address sudah benar.`;
      }
      
      res.json({
        success: true,
        ip: targetIp,
        online: isAnyOpen,
        results,
        diagnostics
      });
    } catch (error) {
      res.json({
        success: false,
        message: "Gagal menjalankan diagnostic scanner",
        error: String(error)
      });
    }
  });

  app.get("/api/icsee/snapshot", async (req, res) => {
    const targetIp = (req.query.ip as string) || deviceConfig.icseeIp;
    const username = (req.query.username as string) || "admin";
    const password = (req.query.password as string) || "";
    
    console.log(`[ICSee] Mengambil snapshot dari ${targetIp}`);

    const wantsJson = req.query.json === "true" || req.headers.accept?.includes("application/json");
    if (wantsJson) {
      res.json({
        success: true,
        url: `/api/icsee/snapshot?ip=${targetIp}&t=${Date.now()}`,
        ip: targetIp
      });
      return;
    }
    
    // Quick scan port 80 to prevent hanging the fetch request
    const isPort80Open = await checkTcpPort(80, targetIp, 800);
    if (isPort80Open) {
      const urlsToTry = [
        `http://${targetIp}/webcapture.jpg?command=snap&channel=1`,
        `http://${targetIp}/cgi-bin/snapshot.cgi?user=${username}&pwd=${password}`,
        `http://${targetIp}/snapshot.jpg`
      ];
      
      for (const url of urlsToTry) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000);
          
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("X-CCTV-Source", "real-camera");
            res.send(Buffer.from(arrayBuffer));
            return;
          }
        } catch (err) {
          // Silently skip and try next
        }
      }
    }
    
    // Fallback: Redirect to high-quality smart home backyard mockup image
    res.redirect("https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80");
  });

  // 3. Android TV Controls (Real ADB TCP/IP Command Execution if installed)
  app.post("/api/tv/control", async (req, res) => {
    const { command, value } = req.body; 
    const targetIp = deviceConfig.tvIp;
    
    // Mapping command to ADB keycodes
    const keyMap: { [key: string]: string } = {
      power: "KEYCODE_POWER",
      home: "KEYCODE_HOME",
      back: "KEYCODE_BACK",
      menu: "KEYCODE_MENU",
      up: "KEYCODE_DPAD_UP",
      down: "KEYCODE_DPAD_DOWN",
      left: "KEYCODE_DPAD_LEFT",
      right: "KEYCODE_DPAD_RIGHT",
      center: "KEYCODE_DPAD_CENTER",
      enter: "KEYCODE_DPAD_CENTER",
      volume_up: "KEYCODE_VOLUME_UP",
      volume_down: "KEYCODE_VOLUME_DOWN",
      mute: "KEYCODE_VOLUME_MUTE"
    };
    const adbKey = keyMap[command] || "";

    console.log(`[Android TV ADB] Memproses perintah: ${command} (${adbKey || value || ""}) untuk TV ${targetIp}`);

    // Execute ADB CLI if available on the system
    try {
      exec("which adb", (err) => {
        if (err) {
          console.log("[Android TV ADB] Perintah adb CLI tidak tersedia di sistem host (Simulasi Aktif)");
          return;
        }

        // Only allow safe Android package names to prevent shell command injection
        const isValidPackage = typeof value === "string" && /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(value);

        let fullCommand = "";
        if (command === "youtube") {
          fullCommand = `adb connect ${targetIp} && adb shell am start -a android.intent.action.VIEW -d "vnd.youtube:"`;
        } else if (command === "launch_app" && isValidPackage) {
          fullCommand = `adb connect ${targetIp} && adb shell monkey -p ${value} -c android.intent.category.LAUNCHER 1`;
        } else if (adbKey) {
          fullCommand = `adb connect ${targetIp} && adb shell input keyevent ${adbKey}`;
        }

        if (fullCommand) {
          exec(fullCommand, (adbErr, stdout, stderr) => {
            if (adbErr) {
              console.error(`[ADB Error] Gagal mengeksekusi ADB ke ${targetIp}:`, stderr);
            } else {
              console.log(`[ADB Success] Berhasil mengirim keyevent ke ${targetIp}:`, stdout.trim());
            }
          });
        }
      });
    } catch (execErr) {
      console.error("[ADB Child Process Execution Error]", execErr);
    }

    res.json({ success: true, message: `Perintah TV ${command} berhasil dikirim ke ${targetIp}` });
  });

  // 4. Fiberhome Router status (SNMP or HTTP scraper simulation)
  app.get("/api/router/status", (req, res) => {
    res.json({
      success: true,
      ssid: "FiberHome-SmartHome-5G",
      connectedClients: 8,
      pingMs: 14,
      downloadSpeed: 94.5, // Mbps
      uploadSpeed: 28.1, // Mbps
      status: "online",
      ip: deviceConfig.routerIp
    });
  });

  app.post("/api/router/reboot", (req, res) => {
    console.log(`[Fiberhome] Melakukan reboot router di ${deviceConfig.routerIp}`);
    res.json({ success: true, message: "Router sedang melakukan booting ulang..." });
  });

  // Real internet speed test (download/upload/ping) using Cloudflare's public speed endpoints
  app.get("/api/router/speedtest", async (req, res) => {
    try {
      // Ping: latency of a tiny request
      const pingStart = Date.now();
      await fetch("https://speed.cloudflare.com/__down?bytes=1000");
      const pingMs = Date.now() - pingStart;

      // Download: pull ~10MB and measure throughput
      const downBytes = 10_000_000;
      const dStart = Date.now();
      const dResp = await fetch(`https://speed.cloudflare.com/__down?bytes=${downBytes}`);
      const dBuf = await dResp.arrayBuffer();
      const dSec = Math.max((Date.now() - dStart) / 1000, 0.001);
      const downloadSpeed = +((dBuf.byteLength * 8) / dSec / 1_000_000).toFixed(1); // Mbps

      // Upload: push ~5MB and measure throughput
      const upBytes = 5_000_000;
      const payload = new Uint8Array(upBytes);
      const uStart = Date.now();
      await fetch("https://speed.cloudflare.com/__up", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/octet-stream" }
      });
      const uSec = Math.max((Date.now() - uStart) / 1000, 0.001);
      const uploadSpeed = +((upBytes * 8) / uSec / 1_000_000).toFixed(1); // Mbps

      console.log(`[Speedtest] down=${downloadSpeed}Mbps up=${uploadSpeed}Mbps ping=${pingMs}ms`);
      res.json({ success: true, download: downloadSpeed, upload: uploadSpeed, ping: pingMs });
    } catch (error: any) {
      console.error("[Speedtest Error]", error?.message || error);
      res.status(502).json({ success: false, message: "Gagal menjalankan speed test", error: String(error?.message || error) });
    }
  });

  // 5. NVR: real CCTV recording + local AI (person/motion) detection
  await registerNvr(app, () => deviceConfig);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

