# spring.techinfo.uz / springadmin.techinfo.uz / qollanma.techinfo.uz

| Host | `/` serves | `/api/`, `/socket.io/` |
| --- | --- | --- |
| `spring.techinfo.uz` | `front/dist` → `/var/www/spring/front` | `127.0.0.1:4000` |
| `springadmin.techinfo.uz` | `admin/dist` → `/var/www/spring/admin` | `127.0.0.1:4000` |
| `qollanma.techinfo.uz` | redirect to the health endpoint | `127.0.0.1:4000` |

One backend, three server blocks. All three still proxy the API, but since
2026-08-16 both SPAs are built to call it by its own name —
`VITE_API_BASE_URL=https://qollanma.techinfo.uz/api/v1` — so the browser
traffic is **cross-site**. axios, socket.io and the tus upload endpoint all
derive from that one variable (`services/apiBase.js`), so it is the only
place the API location is written down.

Cross-site costs three settings and one design decision:

- `ALLOWED_ORIGINS=https://spring.techinfo.uz,https://springadmin.techinfo.uz`
  — read by the express `cors()` middleware, the socket.io server and the tus
  server alike.
- `COOKIE_SAMESITE=none` — a `SameSite=Strict` cookie is never sent on a
  cross-site request, so the refresh cookie would simply vanish.
- `COOKIE_DOMAIN=qollanma.techinfo.uz` — the API host and nothing wider. Do
  **not** widen it to `.techinfo.uz`: that hands the refresh cookie to the six
  unrelated sites sharing this box.
- The CSRF double-submit token no longer travels only in a cookie. A page on
  `spring.techinfo.uz` cannot read a cookie scoped to `qollanma.techinfo.uz`,
  so `/auth/login` and `/auth/refresh` also return `csrfToken` in the response
  body and each SPA keeps it in `localStorage` on its own origin. The check is
  as strong as before — an attacker's page still cannot read it — but without
  this, every page reload 403s on `/auth/refresh` and drops the user at the
  login screen.

## Services

Two systemd units, both from `/opt/spring-lms/backend`, both capped at 512 MB:

| Unit | Runs | Log |
| --- | --- | --- |
| `spring-lms` | `src/server.js` | `/var/log/spring-lms.log` |
| `spring-lms-worker` | `src/worker.js` | `/var/log/spring-lms-worker.log` |

**The worker is not optional and its absence is silent.** It is the only writer
of the admin dashboard snapshot — without it `GET /api/v1/dashboard` returns
`data: null` and the page renders its header over an empty body — and it also
owns video transcoding and deadline reminders. It shells out to `ffmpeg` and
`ffprobe` by name, so ffmpeg has to be installed for uploads to process.

## Server facts (2026-08-16)

- `94.241.173.19`, ports 22/80/443 open; 3912, 4099, 4100, 5000, 7766, 7779
  are the other sites' Node processes, all under PM2.
- **4000 is free** — the backend takes it, bound to loopback.
- Redis (6379) and MinIO (9000) are installed by `bootstrap.sh`, loopback only.
- All three hostnames resolve to the box; certbot covers `spring` +
  `springadmin` on one cert and `qollanma` on another.

## Order of operations

1. A records for all three names → `94.241.173.19`.
2. `bootstrap.sh` on the server: Redis + MinIO + buckets + ffmpeg + both units.
3. Build locally (`vite build` on the box risks OOM with 1.9 GB RAM) and
   rsync `dist/` to `/var/www/spring/{front,admin}`.
4. nginx server blocks, then certbot for all three hosts.
5. Verify: health JSON on all three hosts, a login **and a page reload** on
   both SPAs (the reload is what exercises the cross-site refresh), one
   upload, and `GET /api/v1/dashboard` returning cards rather than `null`.
