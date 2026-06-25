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
