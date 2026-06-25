import fs from "fs";
import type { Express, Request, Response } from "express";
import {
  initStore, persist, listRecordings, getRecording, deleteRecording, listDetections,
} from "./store";
import {
  startRecording, stopRecording, recordingStatus, stopAllRecordings, type Camera,
} from "./recorder";
import {
  startDetection, stopDetection, detectionStatus, isModelReady, stopAllDetections,
} from "./detector";

type GetConfig = () => any;

// Resolve a camera by id from the live config; never trust client-supplied RTSP URLs.
// The client-supplied cameraId is only used to MATCH a configured camera — never to
// fabricate a new one — otherwise arbitrary ids could spawn unbounded ffmpeg sessions.
function resolveCamera(getConfig: GetConfig, cameraId: string): Camera | null {
  const cfg = getConfig();
  const cctvs = cfg.cctvs || [];
  if (cctvs.length > 0) {
    const found = cctvs.find((c: any) => c.id === cameraId);
    if (!found) return null; // unknown id with a multi-camera config -> reject
    return { id: found.id, name: found.name, ip: found.ip, rtspUrl: found.rtspUrl };
  }
  // No multi-camera config: a single legacy iCSee camera with a fixed, trusted id.
  if (cfg.icseeIp) {
    const rtspUrl = cfg.icseeRtspUrl || `rtsp://${cfg.icseeIp}:554/stream1?channel=1&subtype=0`;
    return { id: "icsee", name: cfg.icseeName || "CCTV", ip: cfg.icseeIp, rtspUrl };
  }
  return null;
}

export async function registerNvr(app: Express, getConfig: GetConfig) {
  await initStore();

  const cleanup = () => {
    stopAllRecordings();
    stopAllDetections();
    persist();
  };
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  app.get("/api/nvr/status", (req: Request, res: Response) => {
    res.json({
      success: true,
      recording: recordingStatus(),
      detecting: detectionStatus(),
      modelReady: isModelReady(),
    });
  });

  app.post("/api/nvr/record/start", async (req: Request, res: Response) => {
    const camera = resolveCamera(getConfig, req.body?.cameraId);
    if (!camera) return res.status(404).json({ success: false, message: "Kamera tidak ditemukan di konfigurasi." });
    const result = await startRecording(camera);
    res.status(result.ok ? 200 : 502).json({ success: result.ok, message: result.message });
  });

  app.post("/api/nvr/record/stop", (req: Request, res: Response) => {
    const result = stopRecording(req.body?.cameraId);
    res.json({ success: result.ok, message: result.message });
  });

  app.post("/api/nvr/detect/start", async (req: Request, res: Response) => {
    const camera = resolveCamera(getConfig, req.body?.cameraId);
    if (!camera) return res.status(404).json({ success: false, message: "Kamera tidak ditemukan di konfigurasi." });
    const result = await startDetection(camera);
    res.status(result.ok ? 200 : 502).json({ success: result.ok, message: result.message });
  });

  app.post("/api/nvr/detect/stop", (req: Request, res: Response) => {
    const result = stopDetection(req.body?.cameraId);
    res.json({ success: result.ok, message: result.message });
  });

  app.get("/api/nvr/recordings", (req: Request, res: Response) => {
    const cameraId = req.query.cameraId as string | undefined;
    res.json({ success: true, recordings: listRecordings(cameraId) });
  });

  app.get("/api/nvr/detections", (req: Request, res: Response) => {
    const cameraId = req.query.cameraId as string | undefined;
    res.json({ success: true, detections: listDetections(cameraId) });
  });

  // Stream a recording with HTTP range support (for seeking in the player)
  app.get("/api/nvr/recordings/:id/video", (req: Request, res: Response) => {
    const rec = getRecording(parseInt(req.params.id));
    if (!rec || !fs.existsSync(rec.file)) return res.status(404).json({ success: false, message: "Rekaman tidak ditemukan" });

    const stat = fs.statSync(rec.file);
    const range = req.headers.range;
    res.setHeader("Content-Type", "video/mp4");
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1]) : 0;
      const end = m && m[2] ? parseInt(m[2]) : stat.size - 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", end - start + 1);
      fs.createReadStream(rec.file, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", stat.size);
      fs.createReadStream(rec.file).pipe(res);
    }
  });

  app.delete("/api/nvr/recordings/:id", (req: Request, res: Response) => {
    const rec = deleteRecording(parseInt(req.params.id));
    if (!rec) return res.status(404).json({ success: false, message: "Rekaman tidak ditemukan" });
    try { if (fs.existsSync(rec.file)) fs.unlinkSync(rec.file); } catch { /* noop */ }
    try { if (rec.thumb && fs.existsSync(rec.thumb)) fs.unlinkSync(rec.thumb); } catch { /* noop */ }
    res.json({ success: true, message: "Rekaman dihapus" });
  });

  // Serve a thumbnail image (recording or detection). Confined to the thumbs directory.
  app.get("/api/nvr/thumb/:id", (req: Request, res: Response) => {
    const kind = (req.query.kind as string) === "rec" ? "rec" : "det";
    const id = parseInt(req.params.id);
    const row: any = kind === "rec" ? getRecording(id) : listDetections().find((d) => d.id === id);
    if (!row || !row.thumb || !fs.existsSync(row.thumb)) {
      return res.status(404).end();
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(row.thumb).pipe(res);
  });

  console.log("[NVR] Modul rekaman & AI deteksi aktif");
}
