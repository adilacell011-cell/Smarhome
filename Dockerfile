# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# package-lock.json is generated inside Replit, whose npm registry is an
# internal proxy. Some of its "resolved" URLs point to
# package-firewall.replit.local, which does NOT exist outside Replit — that
# made every off-Replit `npm install` fail (ENOTFOUND). Rewrite those URLs to
# the public npm registry (identical path layout; integrity hashes still
# match). Safety net in case the lockfile gets re-poisoned by a Replit install.
# Also bump npm: the bundled npm 10.x masked this as a cryptic
# "Exit handler never called!"; npm 11.x reports the real error.
COPY package*.json ./
RUN sed -i 's#http://package-firewall.replit.local/npm/#https://registry.npmjs.org/#g' package-lock.json \
    && npm install -g npm@11.17.0 \
    && npm install --no-audit --no-fund

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
# Same Replit-proxy URL rewrite as the builder stage (see note above).
RUN sed -i 's#http://package-firewall.replit.local/npm/#https://registry.npmjs.org/#g' package-lock.json \
    && npm install -g npm@11.17.0 \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Bundled server + built frontend
COPY --from=builder /app/dist ./dist

# Runtime state directories (mounted as volumes from docker-compose)
RUN mkdir -p config data

EXPOSE 5000

# Run node directly (clean SIGTERM handling for `docker stop`)
CMD ["node", "dist/server.cjs"]
