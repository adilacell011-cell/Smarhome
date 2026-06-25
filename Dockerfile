# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install ALL dependencies (incl. dev) needed to build.
# Use `npm install` (not `npm ci`): more tolerant of platform-specific
# optional native packages (rollup/lightningcss/tailwind-oxide).
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Build the frontend (Vite) and bundle the server (esbuild) into /app/dist
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:22-bookworm-slim
WORKDIR /app

# System tools the dashboard shells out to at runtime:
#   - ffmpeg / ffprobe : CCTV frame grabbing + clip recording (NVR)
#   - adb              : Android TV control
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg adb ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000

# Production-only node_modules.
# Kept at runtime because: (1) the server imports "vite" at the top level, and
# (2) sql.js + TensorFlow WASM assets are resolved from node_modules on disk.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Bundled server + built frontend
COPY --from=builder /app/dist ./dist

# Runtime state directories (mounted as volumes from docker-compose)
RUN mkdir -p config data

EXPOSE 5000

# Run node directly (clean SIGTERM handling for `docker stop`)
CMD ["node", "dist/server.cjs"]
