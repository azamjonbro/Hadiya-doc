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

## `/materials`
`GET /topics/:id/materials` + `POST` (multipart upload), `GET|PATCH|DELETE
/materials/:id`. Two ways to read the file, both behind the same course-access
check: `GET /:id/download-url?disposition=attachment|inline` returns a signed,
short-lived S3 URL (`inline` is what the in-app viewer hands to a PDF frame or
an audio player), and `GET /:id/content` streams the raw bytes through the API
for the formats the browser has to parse itself (docx/xlsx/pptx), so the viewer
does not depend on CORS rules on the storage bucket.

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
CRUD, `GET /my`, `GET /assigned-by-me`. `POST /` takes an
`assigneeType` of `USER` (with `assignedTo`), `POSITION` (with `position`)
or `ALL`; the last two fan out to one task document per active recipient
(managers stay scoped to their own department) and respond with
`{ audienceType, audienceValue, batchId, count, items }`.

`GET /board` is the assigner's kanban feed: every copy of every task they
wrote, hydrated with assignee names and **unpaginated** (capped server
side). The admin board groups the fan-outs by `batchId` into one card each,
which is why it cannot use the 20-row `assigned-by-me` page — a single
company-wide assignment can exceed it on its own.

Batch operations act on a whole fan-out, so the board can move or delete a
grouped card in one request instead of one per recipient. Both are limited
to the assigner (or `task:manage:all`), and an unknown or foreign `batchId`
answers 404 alike.

- `PATCH /batch/:batchId` — body `{ status, fromStatus? }`. `fromStatus`
  scopes the change to the copies in the column the card was dragged out
  of, so finished recipients are never dragged backwards. Copies already in
  the target status are skipped (no `completedAt` reset, no notification).
  Every affected assignee still gets the same bell + chat system message a
  single-task change sends. Responds `{ batchId, status, affected }`.
- `DELETE /batch/:batchId?fromStatus=` — deletes the whole fan-out by
  default; the board deliberately omits `fromStatus` here, since a scoped
  delete would strip one status and leave the card sitting in the next.
  Responds `{ batchId, affected }`.

## `/events`
CRUD, `GET /calendar`.

## `/notifications`
`GET /`, `PATCH /:id/read`, `PATCH /read-all`.

## `/ai`
`POST /chat` — scoped strictly to a `courseId`/`topicId`/`videoId` the
caller is actually assigned to; `GET /history`.

## `/reports`
`GET /` (available types), `GET /:type/export?format=csv|xlsx|pdf`.
`lang=uz|ru|en` (default `uz`) writes every header, enum value and document
title in that language — the admin sends whatever locale it is displaying.
Dates stay ISO and the download filename stays the ASCII slug.

## `/audit`
`GET /` (SUPERADMIN/ADMIN, filterable by actor/entity/date range).

## `/health`
`GET /` — unauthenticated liveness check, Phase 1 deliverable.
