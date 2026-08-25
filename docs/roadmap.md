# Development Roadmap

Each phase after Phase 1 gets its own short design note (in chat or an
addendum to these docs) before code, per the project's own working rule:
build in verifiable increments, never dump a large batch of unrelated files
at once, and never leave critical functionality half-wired with a TODO.

| Phase | Scope |
|---|---|
| 0 | Architecture, data model, API contract, security model, roadmap (these docs) |
| 1 | Foundation: monorepo, TS/Express/Mongo/Vue/Tailwind scaffolds, env, logging, error handling, Docker Compose infra |
| 2 | Auth + RBAC: login, refresh rotation, roles/permissions, SuperAdmin seed, 401/403/404 pages |
| 3 | Users: CRUD, department/position, course assignment fields |
| 4 | Courses: courses → topics → videos CRUD, course assignment + deadline logic |
| 5 | Video upload: tus resumable upload endpoint + frontend uploader UI |
| 6 | Video processing: worker process, ffprobe/ffmpeg pipeline, HLS packaging, thumbnails |
| 7 | Secure streaming: playback tokens, manifest rewriting, per-segment auth, watermark overlay |
| 8 | Video analytics: event batching, watched-segment merge algorithm, session tracking, per-video report UI |
| 9 | News: CRUD, targeting, feed |
| 10 | News analytics: scroll/read tracking, per-article report |
| 11 | Tasks & Events: CRUD, statuses, calendar view |
| 12 | Notifications: notification center, triggers (assignment, deadline, expiry, task, news, event) |
| 13 | AI Chat: per-course/topic/video scoped assistant, chat history, strict authorization |
| 14 | Admin analytics dashboard: cards, charts, drill-downs |
| 15 | Reports: CSV/Excel/PDF export across employee/course/video/news/task reports |
| 16 | Security hardening: full test checklist from `docs/security-threat-model.md` |
| 17 | Performance optimization: aggregation pre-computation, caching tuning, load testing |
| 18 | Production deployment: Nginx, PM2/Docker, HTTPS, production Compose/K8s manifests |

Phase 1 is the concrete deliverable of this initial build. It intentionally
contains no business logic (no auth, no course/video models wired to
routes) — only the scaffolding every later phase builds on, verified
booting end-to-end before Phase 2 starts.

## Post-Phase-18: Face Verification

Daily face verification (login + first-video-of-the-day gate, SUPERADMIN
enrollment) — a second factor added on top of the existing password/RBAC
system rather than a new phase's worth of parallel infrastructure. Off by
default (`FACE_VERIFICATION_ENABLED=false`). Full detail:
`docs/face-verification.md`.
