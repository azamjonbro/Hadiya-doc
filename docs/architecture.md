# System Architecture

## Overview

Corporate LMS is built as an **npm workspaces monorepo** with three
deployable apps and one shared package:

```
qo'llanma/
  backend/            Express + TypeScript API + background worker
  front/              Vue 3 SPA — employee-facing
  admin/              Vue 3 SPA — admin + superadmin
  packages/shared/    Shared TS types, permission matrix, DTOs
  docs/               This documentation
  docker-compose.yml  Local infra: MongoDB, Redis, MinIO
```

## Why two frontend apps instead of one

`front/` (employees) and `admin/` (admin/superadmin) are independent
Vite/Vue apps. Reasons:
- The admin app is analytics-heavy (charts, tables, drill-downs) — that
  code should never ship to an employee's browser.
- Each app has its own router, guards, and permission surface; keeping them
  separate avoids one giant route guard trying to cover two very different
  user populations.
- They can be deployed, scaled, and cached independently in production
  (e.g. admin behind an extra network restriction).
- Both import from `packages/shared` so API types, the `Role`/`Permission`
  enums, and the response envelope can never drift apart between apps or
  from the backend.

## Request flow (high level)

```
front/ or admin/ (Axios, Bearer access token + httpOnly refresh cookie)
        │  HTTPS
        ▼
      Nginx (prod: TLS termination, static hosting, reverse proxy,
             HTTP Range passthrough for video segments)
        │
        ▼
   backend/ Express API
   controllers → services → repositories → Mongoose models
   domains: auth, users, roles, courses, topics, videos, video-access,
            video-stream, analytics, news, tasks, events,
            notifications, ai, audit
        │
        ├──────────────┬───────────────┬─────────────────┐
        ▼              ▼               ▼                 ▼
     MongoDB         Redis          MinIO/S3          (external)
   (Mongoose)     (cache + BullMQ  (private bucket,   AI provider
                   job queue)      presigned URLs)    (Phase 13)
                        │
                        ▼
                 worker process (separate Node process)
                 BullMQ consumer: ffprobe → ffmpeg transcode
                 → HLS packaging → thumbnail/poster → upload
```

## Key architectural choices

1. **npm workspaces monorepo.** One root `package.json` with
   `workspaces: ["backend", "front", "admin", "packages/shared"]`. Shared
   types live once and are imported everywhere, so a backend DTO change
   that isn't reflected in the frontend fails at `tsc` time, not at runtime.

2. **Layered backend** (`controllers → services → repositories → models`),
   organized by domain within each layer (see `docs/api-contract.md` for
   the domain list). Controllers stay thin — HTTP concerns only; all
   business logic lives in `services/`; all data access lives in
   `repositories/`. This is spec §40's explicit requirement.

3. **Video processing runs in a separate worker process**, never inside an
   HTTP request. The API enqueues a BullMQ job on upload completion; the
   worker (`backend/src/worker.ts`, run as `npm run worker`) consumes it.
   This means a 2GB video transcode can never block or crash the API
   process (spec §31).

4. **Storage abstraction.** All file I/O goes through a `StorageProvider`
   interface (`putObject/getObject/getSignedUrl/deleteObject/headObject`).
   `LocalStorageProvider` and `S3StorageProvider` (S3-compatible — works
   for MinIO, Cloudflare R2, or AWS S3) both implement it, selected via
   `STORAGE_DRIVER` env var. No code outside `storage/` ever touches a
   filesystem path or bucket URL directly.

5. **Redis serves two roles**: BullMQ job queue backing (video processing,
   scheduled aggregation, deadline checks) and a cache layer (dashboard
   stats, permission lookups) — both wired from day one since local infra
   already runs Redis via Docker Compose, so there's no "add Redis later"
   migration to do.

6. **Security is enforced server-side only.** Frontend route guards,
   disabled buttons, and hidden UI are UX conveniences — every one of them
   is backed by a server-side check that would produce the same result if
   the frontend check were bypassed entirely. See
   `docs/security-threat-model.md`.

## Related documents

- `docs/data-model.md` — MongoDB collections, fields, indexes, relationships
- `docs/api-contract.md` — REST endpoint list by domain
- `docs/auth-rbac.md` — authentication and permission architecture
- `docs/video-streaming.md` — upload, processing pipeline, secure playback
- `docs/analytics.md` — event schema, batching, anti-skip watched-segments
- `docs/security-threat-model.md` — threats and mitigations
- `docs/roadmap.md` — phased build plan
