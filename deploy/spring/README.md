# spring.techinfo.uz / springadmin.techinfo.uz / qollanma.techinfo.uz

| Host | `/` serves | `/api/`, `/socket.io/` |
| --- | --- | --- |
| `spring.techinfo.uz` | `front/dist` → `/var/www/spring/front` | `127.0.0.1:4000` |
| `springadmin.techinfo.uz` | `admin/dist` → `/var/www/spring/admin` | `127.0.0.1:4000` |
| `qollanma.techinfo.uz` | redirect to the health endpoint | `127.0.0.1:4000` |

One backend process, three server blocks. Each SPA proxies the API on its own
host, so every browser request is same-origin: the refresh cookie keeps
`SameSite=Strict` and there is no CORS preflight anywhere. `COOKIE_DOMAIN` is
left **empty** on purpose — each host then issues its own host-only cookie,
and a session on the admin host is not usable on the employee host (nor by the
six unrelated sites sharing this box).

`qollanma.techinfo.uz` stays reachable as the API by its own name; anything
calling it that way is cross-site and must send `Authorization: Bearer`
rather than rely on the cookie.

## Server facts (verified from outside, 2026-08-16)

- `94.241.173.19`, ports 22/80/443 open; 3912, 4099, 4100, 5000 are the other
  sites' Node processes.
- **4000 is free** — the backend takes it, bound to loopback.
- 6379 and 9000 answer nothing: Redis and MinIO are not installed yet.
- DNS: `qollanma` resolves; **`spring` and `springadmin` have no A record**
  and certbot cannot issue for them until they do.

## Order of operations

1. A records for `spring` and `springadmin` → `94.241.173.19`.
2. `bootstrap.sh` on the server: Redis + MinIO + buckets + the systemd unit.
3. Build locally (`vite build` on the box risks OOM with 1.9 GB RAM) and
   rsync `dist/` to `/var/www/spring/{front,admin}`.
4. nginx server blocks, then certbot for all three hosts.
5. Verify: health JSON on all three hosts, login on both SPAs, one upload.
