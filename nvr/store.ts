import path from "path";
import fs from "fs";

export const DATA_DIR = path.join(process.cwd(), "data");
export const REC_DIR = path.join(DATA_DIR, "recordings");
export const THUMB_DIR = path.join(DATA_DIR, "thumbs");
const DB_PATH = path.join(DATA_DIR, "nvr.db");

export type RecordingRow = {
  id: number;
  camera_id: string;
  camera_name: string;
  file: string;
  thumb: string | null;
  start_ts: number;
  end_ts: number;
  duration: number;
  size: number;
};

export type DetectionRow = {
  id: number;
  camera_id: string;
  camera_name: string;
  ts: number;
  label: string;
  score: number;
  thumb: string | null;
};

let db: any = null;
let flushTimer: NodeJS.Timeout | null = null;

function ensureDirs() {
  for (const d of [DATA_DIR, REC_DIR, THUMB_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

export async function initStore() {
  if (db) return;
  ensureDirs();
  const initSqlJs = (await import("sql.js")).default as any;
  const SQL = await initSqlJs({
    locateFile: (f: string) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f),
  });

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      camera_name TEXT,
      file TEXT NOT NULL,
      thumb TEXT,
      start_ts INTEGER NOT NULL,
      end_ts INTEGER NOT NULL,
      duration REAL,
      size INTEGER
    );
    CREATE TABLE IF NOT EXISTS detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      camera_name TEXT,
      ts INTEGER NOT NULL,
      label TEXT NOT NULL,
      score REAL,
      thumb TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_rec_cam ON recordings(camera_id, start_ts);
    CREATE INDEX IF NOT EXISTS idx_det_cam ON detections(camera_id, ts);
  `);
  persist();
}

// Debounced write of the in-memory database to disk
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    persist();
  }, 1500);
}

export function persist() {
  if (!db) return;
  try {
    const data = Buffer.from(db.export());
    fs.writeFileSync(DB_PATH, data);
  } catch (err) {
    console.error("[NVR Store] Gagal menyimpan database:", err);
  }
}

function rowsFromExec(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: any[] = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

export function addRecording(r: Omit<RecordingRow, "id">): number {
  db.run(
    `INSERT INTO recordings (camera_id, camera_name, file, thumb, start_ts, end_ts, duration, size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.camera_id, r.camera_name, r.file, r.thumb, r.start_ts, r.end_ts, r.duration, r.size]
  );
  const id = rowsFromExec("SELECT last_insert_rowid() AS id")[0].id;
  scheduleFlush();
  return id;
}

export function listRecordings(cameraId?: string, limit = 200): RecordingRow[] {
  if (cameraId) {
    return rowsFromExec(
      "SELECT * FROM recordings WHERE camera_id = ? ORDER BY start_ts DESC LIMIT ?",
      [cameraId, limit]
    );
  }
  return rowsFromExec("SELECT * FROM recordings ORDER BY start_ts DESC LIMIT ?", [limit]);
}

export function getRecording(id: number): RecordingRow | null {
  const rows = rowsFromExec("SELECT * FROM recordings WHERE id = ?", [id]);
  return rows[0] || null;
}

export function deleteRecording(id: number): RecordingRow | null {
  const row = getRecording(id);
  if (!row) return null;
  db.run("DELETE FROM recordings WHERE id = ?", [id]);
  scheduleFlush();
  return row;
}

export function addDetection(d: Omit<DetectionRow, "id">): number {
  db.run(
    `INSERT INTO detections (camera_id, camera_name, ts, label, score, thumb)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [d.camera_id, d.camera_name, d.ts, d.label, d.score, d.thumb]
  );
  const id = rowsFromExec("SELECT last_insert_rowid() AS id")[0].id;
  scheduleFlush();
  return id;
}

export function listDetections(cameraId?: string, limit = 100): DetectionRow[] {
  if (cameraId) {
    return rowsFromExec(
      "SELECT * FROM detections WHERE camera_id = ? ORDER BY ts DESC LIMIT ?",
      [cameraId, limit]
    );
  }
  return rowsFromExec("SELECT * FROM detections ORDER BY ts DESC LIMIT ?", [limit]);
}
