---
name: ONVIF RTSP/snapshot discovery for CCTV
description: Why CCTV stream/record/AI must resolve the RTSP URL over ONVIF instead of trusting a configured path.
---

# ONVIF media URI discovery (Xiongmai/iCSee cameras)

The guessed RTSP path (e.g. `/stream1?channel=1&subtype=0`) is frequently WRONG for
these cameras, which silently breaks live image, recording, and AI motion detection —
all three shell out to ffmpeg against the RTSP URL. PTZ kept working because it uses
ONVIF, not RTSP.

**Rule:** resolve the real RTSP (and snapshot) URL from the camera over ONVIF
(`getStreamUri`/`getSnapshotUri`, same `onvif` lib + port 8899 PTZ uses) before any
ffmpeg call; fall back to the configured RTSP only if ONVIF fails. Implemented in
`nvr/onvif.ts` (`resolveStreamUrl`/`resolveSnapshotUrl`, cached positive 5min / negative
60s). `nvr/index.ts resolveCamera` is async and overwrites `rtspUrl` with the resolved one.

**Why:** the camera authoritatively reports its own stream path; guessing does not scale
across firmware variants.

**Gotchas:**
- ONVIF stream/snapshot URIs usually come back WITHOUT credentials — inject `user:pass@`
  (parsed from the configured RTSP URL) before handing to ffmpeg, or auth fails.
- The `onvif` lib normalizes most replies to `{ uri }`, but parse defensively across
  Media1/Media2/linerase-array shapes (`uri`, `mediaUri.uri`, etc.) so a valid URI is
  never missed.
- Never log the credentialed URL — mask `://user:pass@` first.

## Two-way audio reality
Listen-only (camera mic → browser `<audio>` via ffmpeg RTSP→mp3, libmp3lame) is feasible.
Talk-back (browser → camera) is NOT: Xiongmai/iCSee uses a proprietary audio backchannel
browsers can't drive. Do not ship a fake talk-back button; tell the user to use the iCSee app.
