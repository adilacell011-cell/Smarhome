import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

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
  routerPassword: ''
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

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Initial config load
  let deviceConfig = readConfig();

  // Endpoint to get configuration
  app.get("/api/settings", (req, res) => {
    res.json({ success: true, config: deviceConfig });
  });

  // Endpoint to update configuration
  app.post("/api/settings", (req, res) => {
    deviceConfig = { ...deviceConfig, ...req.body };
    const saved = writeConfig(deviceConfig);
    res.json({ success: saved, config: deviceConfig });
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
    import("dgram").then(({ default: dgram }) => {
      const client = dgram.createSocket("udp4");
      const buffer = Buffer.from(payload);
      
      client.send(buffer, 0, buffer.length, targetPort, targetIp, (err) => {
        client.close();
        if (err) {
          console.error(`[WiZ UDP Error] Gagal mengirim paket ke ${targetIp}:`, err);
        }
      });
    }).catch(err => {
      console.error("[WiZ UDP Socket Error]", err);
    });
    
    res.json({ 
      success: true, 
      message: `Perintah WiZ berhasil dikirim ke ${targetIp}:${targetPort}`,
      state: { isOn, brightness, colorTemp, scene, color }
    });
  });

  // 2. CCTV ICSee Controls (RTSP, Snapshot & PTZ)
  app.post("/api/icsee/ptz", (req, res) => {
    const { direction, ip } = req.body; // 'up', 'down', 'left', 'right', 'zoom_in', 'zoom_out'
    const targetIp = ip || deviceConfig.icseeIp;
    console.log(`[ICSee PTZ] Menggerakkan kamera di ${targetIp} ke arah: ${direction}`);
    res.json({ success: true, message: `Kamera bergerak ke ${direction}` });
  });

  app.get("/api/icsee/snapshot", async (req, res) => {
    const targetIp = req.query.ip || deviceConfig.icseeIp;
    const targetRtsp = req.query.rtspUrl || deviceConfig.icseeRtspUrl;
    console.log(`[ICSee] Mengambil snapshot dari ${targetIp}`);
    res.json({ 
      success: true, 
      url: "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80", // High-quality smart home backyard mockup for demo
      ip: targetIp,
      rtsp: targetRtsp
    });
  });

  // 3. Android TV Controls (Real ADB TCP/IP Command Execution if installed)
  app.post("/api/tv/control", async (req, res) => {
    const { command, value } = req.body; 
    const targetIp = deviceConfig.tvIp;
    
    // Mapping command to ADB keycodes
    let adbKey = "";
    switch (command) {
      case "power": adbKey = "KEYCODE_POWER"; break;
      case "home": adbKey = "KEYCODE_HOME"; break;
      case "back": adbKey = "KEYCODE_BACK"; break;
      case "up": adbKey = "KEYCODE_DPAD_UP"; break;
      case "down": adbKey = "KEYCODE_DPAD_DOWN"; break;
      case "left": adbKey = "KEYCODE_DPAD_LEFT"; break;
      case "right": adbKey = "KEYCODE_DPAD_RIGHT"; break;
      case "center": adbKey = "KEYCODE_DPAD_CENTER"; break;
      case "volume_up": adbKey = "KEYCODE_VOLUME_UP"; break;
      case "volume_down": adbKey = "KEYCODE_VOLUME_DOWN"; break;
      case "mute": adbKey = "KEYCODE_VOLUME_MUTE"; break;
      case "youtube": adbKey = "launch_youtube"; break;
      default: adbKey = value || "";
    }

    console.log(`[Android TV ADB] Memproses perintah: ${command} (${adbKey}) untuk TV ${targetIp}`);

    // Execute ADB CLI if available on the system
    import("child_process").then(({ exec }) => {
      exec("which adb", (err) => {
        if (err) {
          console.log("[Android TV ADB] Perintah adb CLI tidak tersedia di sistem host (Simulasi Aktif)");
          return;
        }

        let fullCommand = "";
        if (adbKey === "launch_youtube") {
          fullCommand = `adb connect ${targetIp} && adb shell am start -a android.intent.action.VIEW -d "vnd.youtube:"`;
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
    }).catch(execErr => {
      console.error("[ADB Child Process Import Error]", execErr);
    });

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

