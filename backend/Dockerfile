# Build context is the REPO ROOT (see docker-compose.prod.yml — `context: .`,
# `dockerfile: backend/Dockerfile`), because this is an npm workspaces
# monorepo: backend depends on packages/shared, and `npm ci` needs the root
# package-lock.json to see every workspace. The same image serves both the
# API (`node src/server.js`) and the worker (`node src/worker.js`) — only
# the command differs, set per-service in the compose file.

FROM node:20-bookworm-slim AS base

# ffmpeg/ffprobe are invoked by the worker's video pipeline via bare PATH
# lookup (backend/src/video/ffmpegUtils.js spawns `ffmpeg`/`ffprobe`
# directly) — built into every image from this stage rather than split by
# service, since server.js is small and keeping one image simplifies the
# compose file and CI push/pull.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/

# npm workspaces resolve from the root — installing here (not inside
# backend/) is what makes `@lms/shared: "*"` link correctly.
RUN npm ci --workspace backend --workspace @lms/shared --include-workspace-root

COPY packages/shared packages/shared
COPY backend backend

WORKDIR /app/backend

# No build step — this is plain JavaScript (ES modules), run directly by
# Node, same as `npm run dev` in local development.
ENV NODE_ENV=production
EXPOSE 4000

# dumb-init forwards SIGTERM properly so the app's own graceful-shutdown
# handlers (see server.js/worker.js `process.on('SIGTERM', ...)`) actually
# run instead of the container being SIGKILLed after Docker's default
# grace period.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
