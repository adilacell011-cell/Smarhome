import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { THUMB_DIR, addDetection } from "./store";
import { onDetection } from "./automation";
import type { Camera } from "./recorder";

const INTERVAL_MS = 3000; // how often a frame is analysed
const SCORE_THRESHOLD = 0.55;
const COOLDOWN_MS = 20000; // per camera+label, avoid logging the same thing repeatedly
const RELEVANT = new Set([
  "person", "bicycle", "car", "motorcycle", "bus", "truck", "cat", "dog",
]);

let tf: any = null;
let model: any = null;
let modelLoading: Promise<void> | null = null;

type DetState = { active: boolean; camera: Camera; timer: NodeJS.Timeout | null; busy: boolean };
const sessions = new Map<string, DetState>();
const lastSeen = new Map<string, number>(); // key: cameraId|label

async function ensureModel(): Promise<void> {
  if (model) return;
  if (modelLoading) return modelLoading;
  modelLoading = (async () => {
    tf = await import("@tensorflow/tfjs");
    const wasm = await import("@tensorflow/tfjs-backend-wasm");
    const wasmDir = path.join(process.cwd(), "node_modules", "@tensorflow", "tfjs-backend-wasm", "dist") + path.sep;
    wasm.setWasmPaths(wasmDir);
    await tf.setBackend("wasm");
    await tf.ready();
    const cocoSsd = await import("@tensorflow-models/coco-ssd");
    model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
    console.log(`[NVR AI] Model COCO-SSD siap (backend: ${tf.getBackend()})`);
  })();
  return modelLoading;
}

// Grab a single JPEG frame from the camera's RTSP stream.
function grabFrame(rtspUrl: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-frames:v", "1", "-q:v", "4",
      "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d) => chunks.push(d));
    const killTimer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* noop */ } }, 9000);
    proc.on("close", () => {
      clearTimeout(killTimer);
      const buf = Buffer.concat(chunks);
      resolve(buf.length > 1024 ? buf : null);
    });
    proc.on("error", () => { clearTimeout(killTimer); resolve(null); });
  });
}

async function analyseOnce(state: DetState) {
  if (state.busy || !state.active) return;
  state.busy = true;
  try {
    const frame = await grabFrame(state.camera.rtspUrl);
    if (!frame || !state.active) return;

    const jpeg = await import("jpeg-js");
    const raw = jpeg.decode(frame, { useTArray: true });
    const { width, height, data } = raw;
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4) {
      rgb[j++] = data[i]; rgb[j++] = data[i + 1]; rgb[j++] = data[i + 2];
    }
    const input = tf.tensor3d(rgb, [height, width, 3], "int32");
    let predictions: Array<{ class: string; score: number }> = [];
    try {
      predictions = await model.detect(input);
    } finally {
      input.dispose();
    }

    const now = Date.now();
    const hits = predictions.filter((p) => RELEVANT.has(p.class) && p.score >= SCORE_THRESHOLD);
    let savedThumb: string | null = null;

    for (const p of hits) {
      const key = `${state.camera.id}|${p.class}`;
      if (now - (lastSeen.get(key) || 0) < COOLDOWN_MS) continue;
      lastSeen.set(key, now);

      if (!savedThumb) {
        const tname = `det_${state.camera.id.replace(/[^a-zA-Z0-9_-]/g, "_")}_${now}.jpg`;
        const tpath = path.join(THUMB_DIR, tname);
        try { fs.writeFileSync(tpath, frame); savedThumb = tpath; } catch { /* noop */ }
      }

      addDetection({
        camera_id: state.camera.id,
        camera_name: state.camera.name,
        ts: now,
        label: p.class,
        score: +p.score.toFixed(3),
        thumb: savedThumb,
      });
      console.log(`[NVR AI] ${state.camera.name}: ${p.class} (${(p.score * 100).toFixed(0)}%)`);
      onDetection(state.camera.id, p.class);
    }
  } catch (err: any) {
    console.error(`[NVR AI] ${state.camera.id} analisa gagal:`, err?.message || err);
  } finally {
    state.busy = false;
  }
}

export async function startDetection(camera: Camera): Promise<{ ok: boolean; message: string }> {
  if (sessions.get(camera.id)?.active) return { ok: true, message: "Deteksi sudah aktif" };
  try {
    await ensureModel();
  } catch (err: any) {
    return { ok: false, message: `Gagal memuat model AI: ${err?.message || err}. Saat pertama dijalankan, server butuh internet untuk mengunduh model.` };
  }

  // Confirm the camera produces a frame before committing to the loop.
  const frame = await grabFrame(camera.rtspUrl);
  if (!frame) {
    return { ok: false, message: `Tidak bisa mengambil gambar dari kamera ${camera.name} (${camera.ip}). Pastikan RTSP benar dan kamera di jaringan yang sama.` };
  }

  const state: DetState = { active: true, camera, timer: null, busy: false };
  state.timer = setInterval(() => analyseOnce(state), INTERVAL_MS);
  sessions.set(camera.id, state);
  return { ok: true, message: `AI deteksi aktif untuk ${camera.name}` };
}

export function stopDetection(cameraId: string): { ok: boolean; message: string } {
  const state = sessions.get(cameraId);
  if (!state || !state.active) return { ok: false, message: "Deteksi tidak aktif" };
  state.active = false;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  sessions.delete(cameraId);
  return { ok: true, message: "AI deteksi dihentikan" };
}

export function detectionStatus(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, s] of sessions) out[id] = s.active;
  return out;
}

export function isModelReady(): boolean {
  return !!model;
}

export function stopAllDetections() {
  for (const id of Array.from(sessions.keys())) stopDetection(id);
}
