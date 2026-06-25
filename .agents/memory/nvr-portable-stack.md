---
name: NVR portable stack
description: Why the local CCTV recording + AI detection feature avoids native-compiled deps, and runtime path gotchas.
---

# NVR (local CCTV recording + AI detection) stack

The `nvr/` modules implement real recording + on-device AI on the user's LAN server.

## Decision: no native-compiled dependencies
`better-sqlite3` and `@tensorflow/tfjs-node` both fail to compile in this environment
(node-gyp times out / no usable Python+toolchain). Pivoted to pure-JS / WASM:
- DB: `sql.js` (WASM SQLite) instead of better-sqlite3.
- AI: `@tensorflow/tfjs` + `@tensorflow/tfjs-backend-wasm` + `@tensorflow-models/coco-ssd`
  (base `lite_mobilenet_v2`) instead of tfjs-node.
- Frames/clips: shell out to system `ffmpeg`/`ffprobe` (present in env), spawned with
  array args (never a shell string) to avoid command injection.

**Why:** keeps the build fully portable and reproducible on the user's own server with
no compiler step. Do NOT reintroduce native addons here without confirming a toolchain.

## Runtime path gotcha (esbuild bundling)
Prod build is `esbuild server.ts --bundle --packages=external`, so node_modules stay
external at runtime. WASM/model asset files must be resolved from disk explicitly:
- sql.js: `locateFile` → `node_modules/sql.js/dist/`
- tfjs-wasm: `setWasmPaths(path.join(process.cwd(),"node_modules","@tensorflow","tfjs-backend-wasm","dist") + path.sep)`
Use `process.cwd()`-based paths, not import.meta/__dirname (which point into dist/).

## Other constraints
- coco-ssd downloads its model weights from the internet on the FIRST detection start;
  the server needs outbound internet that once. After that it is cached by tfjs.
- `data/` (sql.js db + recordings + thumbs) is gitignored.
- Camera resolution (`nvr/index.ts resolveCamera`) must only MATCH a client cameraId to a
  configured camera, never fabricate one — otherwise arbitrary ids spawn unbounded ffmpeg
  sessions (DoS). Fallback single-camera mode uses a fixed id `"icsee"`; frontend uses the
  same id so status/recordings keys line up.

## Automation (detect -> device action) — `nvr/automation.ts`
Rules ("if camera X detects label Y -> WiZ on/off or TV action") persist to
`config/automation-rules.json`; `onDetection()` is called from the detector and must NOT be
awaited (don't block the analysis loop). Hard constraints learned in review:
- Device control NEVER uses `exec` with interpolated config (tvIp etc.) — shell injection.
  Use `execFile("adb", [...args])` with arrays, and validate `tvIp` as strict IPv4[:port]
  before use. WiZ is dgram UDP setPilot (no shell).
- Only allow-listed commands run (wiz: on/off; tv: power/youtube/mute/home); reject the rest
  in `saveRules` validation, clamp `cooldownSec` (0..3600), cap rule count.
- Rule file writes are atomic (tmp + fsync + rename); on a corrupt file, KEEP last-known-good,
  do not silently reset to `[]` (would wipe all automations on one bad parse).
- Full-set "replace" endpoints (rules AND light schedules — UI POSTs the entire list) must be
  FAIL-CLOSED: reject the whole batch (`saveRules`/`saveSchedules` return null -> route 400) if
  ANY item is invalid. Never persist a filtered subset — a single malformed entry would silently
  delete all the user's saved rules/schedules.

## Docker deploy (Dockge on home LAN server) — `Dockerfile` / `docker-compose.yml`
Deployed to the user's own LAN server via Dockge, not Replit. Non-obvious constraints that bite if forgotten:
- Runtime image MUST install system `ffmpeg` + `adb` (app spawns them for CCTV record/frames and
  Android TV). Base `node:22-bookworm-slim`; both pkgs exist on bookworm.
- Runtime needs node_modules (`npm ci --omit=dev` is enough): server.ts imports `vite` at top level,
  and sql.js + tfjs-wasm assets are resolved from `node_modules` on disk at runtime.
- `network_mode: host` so the container reaches LAN devices (WiZ UDP, ONVIF, ADB). App listens on
  PORT||5000; with host mode `ports:` is ignored. Bridge mode works for unicast control but loses discovery.
- Persist `./config` (login + device settings, incl. gitignored device-config.json) and `./data`
  (recordings/thumbs/db) as volumes, or the user loses everything on container recreate.
- Image published multi-arch (amd64+arm64) to GHCR via GitHub Actions — target is likely arm64 (Armbian SBC).
  No native node addons (deliberate, see above) so QEMU multi-arch build is cheap.

## App login gate — `server.ts`
The whole dashboard is behind a mandatory login. Credentials live in dashboard config
(`config/device-config.json`) like every other setting — username plaintext (`appUsername`),
password as scrypt `salt:hash` (`appPasswordHash`), NEVER env secrets. **Why:** same reason as
Telegram — user configures everything in the UI on their own LAN server. Default first-run login
is `admin` / `admin123` (hash generated + persisted on first boot if missing).
Hard constraints learned in review:
- `config/device-config.json` MUST stay gitignored — it holds RTSP creds, telegram token, and the
  password hash. It is runtime state, never versioned (the other `config/*.json` schedule files are
  fine to track).
- GET /api/settings strips `appPasswordHash`; POST /api/settings strips BOTH `appPasswordHash` and
  `appUsername` so credentials can only change via `/api/auth/credentials` (which requires the
  current password). Never let the login hash reach the client.
- Sessions are an in-memory Map (httpOnly cookie `sid`, 30-day TTL) — fine that a server restart
  logs everyone out. On ANY credential change, `sessions.clear()` then mint a fresh session for the
  caller, so old/stolen tokens die immediately while the current user stays in.
- Auth middleware gates all `/api/*` except `/api/auth/login|status|logout`. Browser sends the
  cookie automatically for `<img>`/`<video>` src, so thumbnails/streams behind auth just work.

## Telegram snapshot bot — `nvr/telegram.ts`
Scheduled camera snapshots auto-sent to an admin Telegram chat. Bot token + chat ID live in
the DASHBOARD config (`config/device-config.json`, surfaced in SettingsPanel → Telegram tab),
NOT env secrets — user explicitly wanted everything configurable in the UI. **Why:** non-tech
user runs this on their own LAN server and edits all settings through the dashboard, not a shell.
Mirrors the automation patterns: schedules persist to `config/telegram-schedules.json`, fail-closed
full-set save, atomic write, 20s `setInterval` tick with minute-key dedupe, schedules sanitized on
load (drop malformed). Sends via global `fetch`+`FormData`+`Blob` to the Bot API `sendPhoto` (no
SDK). Reuses exported `grabFrame` from detector.ts. Has an in-flight `running` Set guard so a slow/
unreachable camera can't pile up overlapping jobs. `cameraId` "all" expands to configured cameras
only — never fabricate ids (same DoS rule as resolveCamera).

## Light scheduler (time-based) — same `nvr/automation.ts`
Schedules ("turn lamp X on/off at HH:MM on chosen days") persist to `config/light-schedules.json`
and reuse `runAction` (WiZ UDP). A single `setInterval(tickSchedules, 20000)` checks every 20s and
fires any schedule matching the current minute AT MOST ONCE per minute via a `schedLastFired`
minute-key guard. `initAutomation` clears the prior interval before starting a new one (no leak on
restart). `days` is `number[]` 0=Sun..6=Sat; empty = every day. UI lives in WizControl.tsx
(`LightScheduler`), lamp options come from the `wizLamps` prop ("all" works even for single legacy lamp).
