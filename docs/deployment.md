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
- **Backups**: automated — see §5 below. The S3/MinIO buckets are *not*
  covered by it and should be backed up or replicated separately; losing
  `lms-processed` means re-transcoding every video from `lms-originals`,
  which still exists but costs worker time to redo.
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

## 5. Backup and restore

The worker takes one encrypted `mongodump` a night and uploads it to the
`S3_BUCKET_BACKUPS` bucket, keeping `BACKUP_RETENTION_DAYS` (30) of
archives. It is **off until an operator turns it on**, because it needs an
encryption key that only a human can generate and store somewhere that
survives the machine.

### Turning it on

1. Generate a key and put it in the password manager **before** putting it
   in `.env` — every archive is unreadable without it:
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. In `backend/.env`:
   ```
   BACKUP_ENABLED=true
   BACKUP_ENCRYPTION_KEY=<the 64 hex characters>
   S3_BUCKET_BACKUPS=lms-backups
   ```
   The backend refuses to boot if the flag is on and the key is missing or
   the wrong length.
3. Create the bucket and confirm it is **private** — it holds every
   JSHSHIR, password hash and proctoring record in the system:
   ```sh
   mc mb local/lms-backups && mc anonymous set none local/lms-backups
   ```
4. Make sure `mongodump` and `mongorestore` are on the worker's PATH
   (`apt install mongodb-database-tools`, `brew install mongodb-database-tools`).
   PM2 processes often inherit a shorter PATH than the shell — set
   `MONGODUMP_BIN`/`MONGORESTORE_BIN` to absolute paths if the first run
   reports "not found on PATH".
5. Restart the worker and prove it end to end without waiting for 03:20:
   ```sh
   pm2 reload qollanma-worker
   npm --prefix backend run backup:now
   npm --prefix backend run backup:list
   ```
   The worker's boot log states the schedule it registered, or says
   `BACKUP_ENABLED=false` if the flag never took.

### Restoring

Backups are AES-256-GCM envelopes (`QLMSBK01` magic, 96-bit IV, auth tag at
the end), so a truncated or altered archive fails at decrypt instead of
restoring a half database.

**Drill** — restore into a scratch database and compare, never into the
live one. The tool refuses the live database name unless `--force`:

```sh
npm --prefix backend run backup:restore -- --latest   --target mongodb://localhost:27018/qollanma_restore_check
```

Then check that the restore is actually complete, e.g.:

```sh
mongosh mongodb://localhost:27018/qollanma_restore_check   --eval 'db.getCollectionNames().map(c => [c, db[c].countDocuments()])'
```

and drop the scratch database when done.

**Real recovery** — after confirming a drill restore looks right:

```sh
pm2 stop qollanma qollanma-worker
npm --prefix backend run backup:restore -- --key <object-key>   --target "$MONGO_URI" --force        # --force implies --drop
pm2 start qollanma qollanma-worker
```

`--force` is what lets a restore overwrite the running deployment's own
database, and it drops each restored collection first. Without it the
command stops rather than touching production.

### What is verified, and how

`backend/test/backup.test.js` runs the whole chain against a live MongoDB —
seed, `mongodump`, encrypt, store, download, decrypt, `mongorestore` into a
differently-named database, then compares documents, dates and a unique
index. It also covers the failure modes worth having: a flipped byte, the
wrong key, a file that is not a backup, and the retention sweep's rule that
it never deletes the last remaining archive.

```sh
npm --prefix backend test
```

Two notes on how the restore is invoked, both learned the hard way:

- The archive remembers the database it came from, so restoring under a
  different name needs `--nsFrom/--nsTo`, and the target URI must then
  carry **no** database — mongorestore reads a database in the URI as
  `--db`, filters the archive by the *original* namespace, finds nothing,
  and exits 0 having restored zero documents. `restoreBackup()` strips it.
- The retention sweep keeps the newest archive whatever its age. A month
  of failed backups otherwise ends with the sweep deleting the last good
  one — a broken job turning into data loss.
