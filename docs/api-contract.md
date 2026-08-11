# API Contract

Base path: `/api/v1`. Every response uses the standard envelope (spec §37):

```jsonc
// success
{ "success": true, "message": "...", "data": { } }
// failure
{ "success": false, "message": "...", "code": "SOME_ERROR_CODE", "data": null }
```

List endpoints use cursor-based pagination (`?cursor=&limit=`).

Standard middleware chain for a mutating endpoint:
`authenticate → requirePermission(x) → loadResourceAndCheckAccess → validate(zodSchema) → controller`.
Reads follow the same chain minus `validate`.

## `/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/login` | username/email + password + captcha token |
| POST | `/refresh` | httpOnly cookie in, rotated cookie out, CSRF double-submit checked |
| POST | `/logout` | revokes current session |
| POST | `/password-reset/request` | |
| POST | `/password-reset/confirm` | |

## `/users`
CRUD (SUPERADMIN/ADMIN/MANAGER, scope-limited), `GET /me`,
`GET /:id/courses`, `GET /:id/analytics`.

## `/roles`, `/permissions`
CRUD (`/roles`) and read-only catalogue (`/permissions`), SUPERADMIN only.

## `/courses`, `/topics`
CRUD; `GET /courses/:id/topics`.

## `/videos`
CRUD, `POST /:id/upload` (tus protocol endpoint), `GET /:id/status`
(processing status polling), `POST /:id/retry-processing`.

## `/video-access`
`POST /:videoId/token` — validates the caller's `courseAssignment`
(assigned, not expired, deadline not passed) and issues a short-lived signed
playback token.

## `/video-stream`
`GET /:videoId/master.m3u8`, `GET /:videoId/:quality.m3u8`,
`GET /:videoId/segment/:file`, `GET /:videoId/key` — all require `?token=`,
re-validated on every single request (not just the manifest).

## `/analytics`
`POST /video/events` (batched event array), `GET /video/:videoId/report`
(per-user detailed report, spec §9).

## `/video-analytics`
Admin dashboard aggregate endpoints: completion rates, most-skipped/
most-paused videos, engagement leaderboards — reads from pre-aggregated
cache, not raw events.

## `/news`, `/news-analytics`
`/news` CRUD + `GET /feed` (targeted by role/department, publish/expiry
window). `/news-analytics`: `POST /:id/events` (scroll/read events),
`GET /:id/report`.

## `/tasks`
CRUD, `GET /my`, `GET /assigned-by-me`.

## `/events`
CRUD, `GET /calendar`.

## `/notifications`
`GET /`, `PATCH /:id/read`, `PATCH /read-all`.

## `/ai`
`POST /chat` — scoped strictly to a `courseId`/`topicId`/`videoId` the
caller is actually assigned to; `GET /history`.

## `/audit`
`GET /` (SUPERADMIN/ADMIN, filterable by actor/entity/date range).

## `/health`
`GET /` — unauthenticated liveness check, Phase 1 deliverable.
