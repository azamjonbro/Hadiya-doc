# Deploying front + admin + backend to qollanma.techinfo.uz

Both SPAs are served from this box, each single-origin with the API. The
static files sit at `/`, the API is reverse-proxied at `/api`, and
socket.io at `/socket.io` — so the `SameSite=Strict` refresh cookie is
always attached and there is no CORS preflight anywhere.

| Host | `/` serves | `/api/`, `/socket.io/` |
| --- | --- | --- |
| `qollanma.techinfo.uz` | `front/dist` → `/var/www/qollanma/front` | `127.0.0.1:4000` |
| `admin.qollanma.techinfo.uz` | `admin/dist` → `/var/www/qollanma/admin` | `127.0.0.1:4000` |

One backend process serves both; the admin host simply proxies to it too,
which is why the admin app is same-origin rather than merely same-site.

Cookies: the refresh cookie is issued with `Domain=qollanma.techinfo.uz`,
and an explicit `Domain` attribute covers subdomains, so the admin host
receives it with `COOKIE_DOMAIN` unchanged. Do **not** widen it to
`.techinfo.uz`: that would hand the refresh cookie to the six unrelated
sites on this box.

DNS: `qollanma.techinfo.uz` already resolves to `94.241.173.19`. Add an A
record for `admin.qollanma.techinfo.uz` pointing at the same IP **before**
running certbot for it.

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
npm run build --workspace front
npm run build --workspace admin
```

No env vars needed on the command line: `front/.env.production` and
`admin/.env.production` are committed and each already points at its own
host. `VITE_API_BASE_URL` is baked in at build time, not read at runtime —
a change means a rebuild. Both use an absolute URL rather than a bare
`/api/v1`: `src/services/socket.js` derives the socket origin by stripping
the `/api/v1` suffix, and a relative value would leave it empty.

Verify what actually landed in the bundle before shipping:

```sh
grep -o 'https://[a-z.]*qollanma\.techinfo\.uz/api/v1' front/dist/assets/*.js admin/dist/assets/*.js
```

(The `http://localhost:4000/api/v1` string also present in both bundles is
the dead fallback in `src/services/apiBase.js`, not the configured value.)

### 3. Ship

```sh
rsync -az --delete front/dist/ root@94.241.173.19:/var/www/qollanma/front/
rsync -az --delete admin/dist/ root@94.241.173.19:/var/www/qollanma/admin/
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
cp nginx.conf       /etc/nginx/sites-available/qollanma.techinfo.uz
cp nginx-admin.conf /etc/nginx/sites-available/admin.qollanma.techinfo.uz
ln -s ../sites-available/qollanma.techinfo.uz       /etc/nginx/sites-enabled/
ln -s ../sites-available/admin.qollanma.techinfo.uz /etc/nginx/sites-enabled/
certbot --nginx -d qollanma.techinfo.uz -d admin.qollanma.techinfo.uz
nginx -t && systemctl reload nginx
```

Two standalone site files — leave every other site on this nginx untouched.
Both certs come from one certbot run; the admin A record must already exist
or that half of the challenge fails and neither cert is issued.

Run `nginx -t` before the reload every time: a syntax error here takes down
all seven sites, not just this one.

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
- `https://admin.qollanma.techinfo.uz/login` typed directly → same
- `https://qollanma.techinfo.uz/api/v1/health` → `{"success":true,...}`
- `https://admin.qollanma.techinfo.uz/api/v1/health` → same (admin host proxies too)
- Log in on both, wait past the 15-minute access TTL, reload → still signed in (refresh cookie reaches the subdomain)
- Open chat → messages arrive live (socket.io upgrade works, admin origin is in `ALLOWED_ORIGINS`)
- Play a lesson past 3 minutes → no interruption (playback token refresh works)
