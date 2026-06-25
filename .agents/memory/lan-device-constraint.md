---
name: LAN device constraint
description: Why some Adilanet dashboard features only work on the home network, not the Replit cloud deploy
---

The Adilanet dashboard controls smart-home devices on a local network (`192.168.x.x`): Philips WiZ lamps (UDP 38899), iCSee/Xiongmai CCTV (ONVIF, RTSP, NETIP), Android TV (ADB over TCP), and a Fiberhome router.

**Rule:** Features that talk to these devices (WiZ control/status, CCTV PTZ via ONVIF, snapshot, ADB TV control) only function when the server runs on the same LAN as the devices. The Replit cloud deployment cannot reach a user's home LAN, so those calls will time out there.

**Why:** Cloud egress has no route to private home subnets. This is environmental, not a bug.

**How to apply:** When a user reports a device feature "not working," first check whether they are running the app from the cloud vs. on a home device. Don't try to "fix" timeouts by changing code. Features that DO work in cloud: anything self-contained (e.g. `/api/router/speedtest` measures the server's own internet via Cloudflare endpoints; AI image analysis if wired to Gemini). PTZ endpoint allowlists target IPs to configured cameras to avoid arbitrary internal-host probing.
