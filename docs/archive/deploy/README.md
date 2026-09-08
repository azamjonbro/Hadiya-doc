# Archived deployment notes — techinfo.uz

These describe the **retired** VM deployment. They are kept because they
record decisions that still explain the current code — chiefly the
cross-site cookie and CORS setup that `COOKIE_SAMESITE`, `ALLOWED_ORIGINS`
and `services/apiBase.js` were shaped by — not because anything here is
still runnable.

| Folder | Hosts it configured | Status |
|---|---|---|
| `spring/` | `spring.techinfo.uz`, `springadmin.techinfo.uz`, `qollanma.techinfo.uz` | retired 2026-08-31 |
| `qollanma.techinfo.uz/` | `qollanma.techinfo.uz`, `admin.qollanma.techinfo.uz` | retired, superseded by `spring/` |

Two things in them are now wrong twice over:

- **The hosts no longer exist.** The deployment moved to the home server on
  2026-08-31 and answers on `qollanma.sds-max.uz` (API, socket, media) and
  `spring.sds-max.uz` (SPA), behind a Cloudflare tunnel rather than a public
  nginx on a VM.
- **The separate admin SPA no longer exists.** `springadmin.techinfo.uz` and
  `admin.qollanma.techinfo.uz` served the `admin/` app, which was merged into
  the employee SPA at `/bos` and deleted from the repository. Every server
  block here that proxies an admin host has nothing left to proxy to.

For the current setup see `docs/deployment.md`. The live nginx configuration
lives on the server itself and is not mirrored here — a copy in the repo is
what let these two folders drift a full domain move without anyone noticing.
