# Deployment (spec §48)

Two supported paths — pick one, both reverse-proxy through the same
`nginx/reverse-proxy.conf`:

| | Docker | PM2 (bare metal) |
|---|---|---|
| Files | `docker-compose.prod.yml`, `backend/Dockerfile`, `front/Dockerfile`, `admin/Dockerfile` | `ecosystem.config.cjs` |
| Best for | Anything with a container runtime available | A single VM with no Docker |
| Mongo/Redis/MinIO | Included as services (or point at managed equivalents) | Bring your own (managed or self-hosted) |

Everything below applies to both — start there.

## 1. Prerequisites

- A domain with three hostnames pointed at the server: the apex (front),
  `admin.`, and `api.` (edit `nginx/reverse-proxy.conf` if your domain
  layout differs — it's plain nginx, not templated).
- TLS is **mandatory** (spec §48) — no plain-HTTP path serves app content;
  `nginx/reverse-proxy.conf`'s port-80 server block only ever redirects.
  Get a cert covering all three hostnames, e.g.:
  ```sh
  certbot certonly --standalone \
    -d lms.example.com -d admin.lms.example.com -d api.lms.example.com
  ```
  Mount/copy `fullchain.pem` + `privkey.pem` into `nginx/certs/` (Docker
  path) — matches the `TLS_CERT_DIR` volume in `docker-compose.prod.yml`.
  Renewal: `certbot renew` on a cron/systemd timer, then `nginx -s reload`
  (or `docker compose restart nginx`) to pick up the renewed cert.
- ffmpeg + ffprobe available to whatever runs the worker — built into
  `backend/Dockerfile`; on PM2, install via the OS package manager
  (`apt install ffmpeg` / `brew install ffmpeg`).

## 2. Environment

Copy `backend/.env.example` to `backend/.env` and fill in every value —
see that file's comments for what each is for. Non-negotiables for
production specifically:

- Every secret (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`,
  `VIDEO_TOKEN_SECRET`) — generate fresh ones, never reuse the dev values:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `NODE_ENV=production`
- `ALLOWED_ORIGINS` — the real front/admin origins only, no wildcard
  (spec §33 — a wildcard here is a CORS misconfiguration, not a
  convenience)
- `COOKIE_DOMAIN` — the real apex domain (e.g. `.lms.example.com`) so the
  refresh-token cookie is readable across the `admin.` subdomain too if
  your deploy needs that
- `CAPTCHA_SECRET` — leaving this blank bypasses captcha verification
  entirely (logged as a warning on every boot); only acceptable in dev
- `SUPERADMIN_EMAIL` / `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` — a
  real password, not the one in this repo's dev `.env`. Seeded once on
  first boot only if no SUPERADMIN exists yet — rotate the password via
  the app afterward rather than editing these and redeploying.
- `LOG_LEVEL=http` — enables the per-request access log (spec §49:
  request + response status on every request); `info` (the dev default)
  only logs business events and errors, not routine traffic. See
  `backend/src/middlewares/requestLogger.middleware.js`.
- `STORAGE_DRIVER=s3` + `S3_*` — either the bundled MinIO service (set
  `S3_ENDPOINT=http://minio:9000` in Docker) or a managed S3-compatible
  provider. Either way, the buckets must stay private — `minio-init`
  already sets `mc anonymous set none` on both; a managed provider needs
  the equivalent "block all public access" setting confirmed.
- `ANTHROPIC_API_KEY` — optional; AI chat (Phase 13) returns a clean
  `AI_CHAT_UNAVAILABLE` error without it rather than failing to boot.

`front/`'s and `admin/`'s API base URL (`VITE_API_BASE_URL`, e.g.
`https://api.lms.example.com/api/v1`) is a **build-time** Vite env var —
set it via `--build-arg` (Docker) or a `.env.production` file in each
app's directory before `npm run build` (PM2 path). Changing it always
requires a rebuild, never just a restart.

## 3. First boot

Docker:
```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend worker
```

PM2:
```sh
npm ci
npm run build                       # builds front/ and admin/ dist/
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup
```

Either way, watch the first boot log for:
- `MongoDB connected` — confirms `MONGO_URI` is reachable
- The SuperAdmin seed running exactly once (subsequent restarts skip it
  if a SUPERADMIN already exists — safe to restart repeatedly)
- `Dashboard aggregation worker started` from the worker process — if
  this is missing, the admin dashboard (Phase 14) will sit empty since
  nothing ever populates its Redis/Mongo cache

## 4. Operational notes

- **Logs go to stdout/stderr only** (Winston's Console transport — see
  `backend/src/config/logger.js`) by design, not to a file the app
  manages itself. Docker: `docker compose logs`, or ship them wherever
  your log aggregation already points (Loki, CloudWatch, etc.) via the
  container runtime's log driver. PM2: `pm2 logs`, and consider
  `pm2-logrotate` since PM2's own log files aren't rotated by default.
- **Backups**: `mongodump`/`mongorestore` (or your managed Mongo
  provider's snapshot feature) for the database; the S3/MinIO buckets
  hold processed video and should be backed up or replicated separately
  — losing `lms-processed` means re-transcoding every video from
  `lms-originals`, which still exists but costs worker time to redo.
- **Scaling the API** is safe to do horizontally (JWT auth is stateless,
  no sticky sessions) — multiple `backend` replicas behind nginx, or PM2
  cluster mode (`ecosystem.config.cjs` already sets `instances: 'max'`
  for it). **The worker is not** — BullMQ's repeatable jobs (deadline
  reminders, dashboard aggregation) assume a single scheduler; run
  exactly one `worker` process. Video-processing *throughput* scales via
  the `Worker({ concurrency: N })` value inside `worker.js` instead.
- **Zero-downtime deploys**: `docker compose up -d --build` recreates
  containers one at a time by default, but a load balancer / nginx
  `upstream` with more than one backend replica is what actually avoids a
  request-dropping gap — a single-replica deploy always has a brief gap
  while the new container starts.
