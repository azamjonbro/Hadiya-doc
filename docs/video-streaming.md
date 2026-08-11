# Video Storage & Streaming Architecture

## Upload — resumable, 1-2GB+ (spec §30)

Uses the **tus resumable-upload protocol** (`@tus/server` on the backend,
`tus-js-client` on the frontend) rather than a hand-rolled chunking scheme.
tus natively provides pause/resume/cancel and chunked streaming — neither
the browser nor the server ever buffers the whole file in memory, and an
interrupted upload resumes from its last confirmed byte offset instead of
restarting.

On upload completion:
1. The original file lands in a private `originals/{videoId}` storage key
   (never public).
2. A `videos` document is created with `processingStatus: PENDING`.
3. A BullMQ job is enqueued for the worker process.

## Processing pipeline (spec §31 — background worker, never in the HTTP cycle)

```
PENDING
  → VALIDATING    ffprobe metadata extraction + magic-byte/container check
                   (`file-type` package) — rejects anything that isn't
                   actually a valid video regardless of its extension
  → TRANSCODING    ffmpeg → 360p / 480p / 720p / 1080p, skipping any
                   rendition above the source's native resolution
  → PACKAGING      HLS segments + per-quality .m3u8 + master playlist;
                   optional AES-128 HLS encryption applied here
  → THUMBNAIL      single-frame thumbnail + poster image generated
  → UPLOAD          processed assets pushed to `processed/{videoId}/`
                    in the private bucket
  → READY           (or FAILED — BullMQ retry with backoff, plus a manual
                    "retry processing" action for admins)
```

This entire pipeline runs in `backend/src/worker.ts`, a **separate Node
process** from the API (`npm run worker`), consuming the BullMQ queue backed
by Redis. A stuck or slow transcode can never block API requests.

## Playback authorization (spec §2, §32)

```
1. Client → POST /video-access/:videoId/token
   Backend checks: authenticated, courseAssignment active
   (not expired, deadline not passed) → issues a short-lived
   (2-5 min) signed JWT scoped to {userId, videoId, exp}.

2. Client → GET /video-stream/:videoId/master.m3u8?token=...
   Backend validates the token, fetches the real manifest from
   storage, and REWRITES every segment/key line to point back at
   /video-stream/:videoId/segment/:file?token=... — the same
   short-lived token, re-validated on EVERY segment request.
   The storage bucket's own URL/credentials are never sent to
   the client. HTTP Range requests pass through so seeking works.

3. Token binds to userId + videoId + expiry (optionally a hashed
   User-Agent). A leaked link stops working within minutes and
   can't be reused by a different account — every segment request
   re-checks the token, not just the initial manifest request.

4. Optional AES-128 HLS encryption: the key endpoint
   (/video-stream/:videoId/key) requires the same per-request
   token validation as segments.
```

## Dynamic watermark

Rendered **client-side** as an overlay component (user name, user ID,
company, current timestamp) positioned over the `<video>` element and
periodically reflowed. This is explicitly a **deterrent and leak-tracing
tool, not a security boundary** — it does not stop screen recording, but a
leaked recording carries the watermark that identifies its source. Baking
the watermark into the video stream itself was rejected: it would require a
per-user transcode, which doesn't scale past a handful of viewers per video.

## Anti-hotlinking (additional layer, not primary defense)

Origin/Referer header checks, strict CORS allow-list, and a private bucket
with no public/anonymous read access. These supplement, but never replace,
the token-based authorization above (spec §2 is explicit that F12/DevTools/
referer checks are deterrents, not boundaries).

## Storage abstraction

```ts
interface StorageProvider {
  putObject(key: string, stream: Readable, contentType: string): Promise<void>
  getObject(key: string): Promise<Readable>
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>
  deleteObject(key: string): Promise<void>
  headObject(key: string): Promise<{ size: number; contentType: string }>
}
```

Two implementations: `LocalStorageProvider` (disk, for constrained
environments) and `S3StorageProvider` (aws-sdk v3 `S3Client` — works
unmodified against MinIO, Cloudflare R2, or AWS S3, since all are
S3-compatible). Selected at boot via `STORAGE_DRIVER` env var; nothing
outside `backend/src/storage/` ever touches a raw path or bucket URL.
Local development runs MinIO via Docker Compose specifically so the
signed-URL/private-bucket code path is exercised the same way it will be in
production — no local-disk shortcut that behaves differently.
