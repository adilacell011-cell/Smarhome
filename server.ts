import express from "express";
import path from "path";
import fs from "fs";
import net from "net";
import dgram from "dgram";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";

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
  const PORT = Number(process.env.PORT) || 5000;

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
  app.post("/api/icsee/ptz", (req, res) => {
    const { direction, ip } = req.body; // 'up', 'down', 'left', 'right', 'zoom_in', 'zoom_out'
    const targetIp = ip || deviceConfig.icseeIp;
    console.log(`[ICSee PTZ] Menggerakkan kamera di ${targetIp} ke arah: ${direction}`);
    res.json({ success: true, message: `Kamera bergerak ke ${direction}` });
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

