# Deploying front + backend to qollanma.techinfo.uz

Single-origin layout: the employee SPA is served as static files at `/`, the
API is reverse-proxied at `/api`, and socket.io at `/socket.io`. Everything
is same-origin, so the `SameSite=Strict` refresh cookie is always attached
and there is no CORS preflight anywhere.

| Path | Serves |
| --- | --- |
| `/` | `front/dist` (static, SPA fallback) |
| `/api/` | backend on `127.0.0.1:4000` |
| `/socket.io/` | backend, WebSocket upgrade |

The admin app is not part of this host. Add it later at
`admin.qollanma.techinfo.uz` — still same-site (the registrable domain is
`techinfo.uz`), so `COOKIE_SAMESITE=strict` keeps working, but set
`COOKIE_DOMAIN=.qollanma.techinfo.uz` at that point so the cookie is shared
with the subdomain. Do **not** widen it to `.techinfo.uz`: that would hand
the refresh cookie to the six unrelated sites on this box.

## Server constraints

This is shared infrastructure. nginx already serves algoritm/dacha/oil/ops/
prava/soat `.techinfo.uz`, and Node processes under `/root/apps` and
`/root/OPS` hold ports 3912, 5000, 7766, 7779, 4100, 4099. Port 4000 is
free. MongoDB (127.0.0.1:27017, auth required) and PostgreSQL are shared
with those sites. Redis and MinIO are **not installed**.

RAM is 1.9 GB total with ~860 MB available, so **build locally and ship
`dist/`** — `vite build` on the box risks an OOM that would take the other
sites down with it.

## Steps

### 1. Prerequisites on the server

```sh
apt-get update && apt-get install -y redis-server
systemctl enable --now redis-server          # binds 127.0.0.1:6379

# MinIO, loopback-only so nginx never needs to proxy it
useradd -r -s /sbin/nologin minio-user || true
mkdir -p /var/lib/minio && chown minio-user: /var/lib/minio
# install the binary + a systemd unit, then create the five buckets:
#   lms-originals lms-processed lms-images lms-materials lms-chat
```

Node is not on root's PATH even though the other sites run on it — find the
binary the existing apps use (`ls -l /proc/<pid>/exe` for one of the
`/root/apps` processes) and reuse that exact version rather than installing
a second runtime that could shadow theirs.

### 2. Build locally

```sh
npm ci
VITE_API_BASE_URL=https://qollanma.techinfo.uz/api/v1 npm run build --workspace front
```

`VITE_API_BASE_URL` is baked in at build time, not read at runtime — a
change means a rebuild. Use the absolute URL rather than a bare `/api/v1`:
`front/src/services/socket.js` derives the socket origin by stripping the
`/api/v1` suffix, and a relative value would leave it empty.

### 3. Ship

```sh
rsync -az --delete front/dist/ root@94.241.173.19:/var/www/qollanma/front/
rsync -az --delete --exclude node_modules --exclude .env \
  backend/ packages/ package.json package-lock.json \
  root@94.241.173.19:/root/apps/qollanma/
```

Then on the server: `npm ci --omit=dev`, copy `backend.env.example` to
`backend/.env`, fill in every placeholder, and start both processes under
PM2 (`src/server.js` and `src/worker.js` — the worker handles video
transcoding and reminder jobs, and nothing works without it).

### 4. nginx + TLS

```sh
cp nginx.conf /etc/nginx/sites-available/qollanma.techinfo.uz
ln -s ../sites-available/qollanma.techinfo.uz /etc/nginx/sites-enabled/
certbot --nginx -d qollanma.techinfo.uz
nginx -t && systemctl reload nginx
```

DNS already resolves `qollanma.techinfo.uz` to `94.241.173.19`.

### 5. Data migration

Scope every restore to the single `corporate-lms` database — a
whole-instance `--drop` would destroy the other sites' data.

```sh
# local dump already taken: 32 collections
mongodump --uri "mongodb://localhost:27018/corporate-lms" --out dump/

# on the server: back up what is there FIRST
mongodump --uri "<server-uri>" --db corporate-lms --out /root/backups/pre-restore/

# then restore only this namespace
mongorestore --uri "<server-uri>" --drop --nsInclude 'corporate-lms.*' dump/
```

Uploads (videos, materials, avatars, chat attachments) live in MinIO, not
Mongo, and must be mirrored separately once the buckets exist:

```sh
mc alias set local  http://localhost:9000 <local-key> <local-secret>
mc alias set remote http://127.0.0.1:9000 <server-key> <server-secret>   # via SSH tunnel
for b in lms-originals lms-processed lms-images lms-materials lms-chat; do
  mc mirror --overwrite "local/$b" "remote/$b"
done
```

## Verify

- `https://qollanma.techinfo.uz/login` typed directly → app boots (SPA fallback works)
- `https://qollanma.techinfo.uz/api/v1/health` → `{"success":true,...}`
- Log in, wait past the 15-minute access TTL, reload → still signed in (refresh cookie works)
- Open chat → messages arrive live (socket.io upgrade works)
- Play a lesson past 3 minutes → no interruption (playback token refresh works)
