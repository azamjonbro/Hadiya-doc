# Security Threat Model

Critical rule (spec §52): frontend hidden buttons, disabled buttons, route
guards, and DevTools blocking are **not security** — every mitigation below
is enforced server-side. F12/DevTools blocking, where present, is a UX
deterrent only.

| Threat | Mitigation |
|---|---|
| Credential stuffing / brute force | Rate limit + progressive slow-down + CAPTCHA + account lockout (`failedLoginAttempts`/`lockedUntil`) + audit log on every `/auth/login` attempt |
| Session/access-token theft | Short-lived (~15min) access JWT held in memory; httpOnly/Secure/SameSite=strict refresh cookie, rotated on every use; reuse of an already-rotated refresh token revokes the entire session family |
| IDOR (e.g. `GET /users/123/courses` for someone else's ID) | Every route re-derives the target resource and checks it against the *authenticated* identity's access — a URL or body ID is never trusted as sufficient authorization on its own |
| Privilege escalation | Role/permission changes are SUPERADMIN-only and re-checked server-side on every request; permission claims are signed into the JWT, never editable client-side |
| Video URL / content leakage | Short-lived per-segment signed tokens (re-validated on every segment, not just the manifest), private storage bucket with no public read, rewritten manifests that never expose the raw bucket URL, optional AES-128 HLS encryption, client-side identity watermark for leak tracing |
| Malicious file upload | Extension allowlist at upload creation, then real content validation via ffprobe during processing (parses actual container/codec structure — a renamed non-video file fails `VALIDATING` and never reaches storage as PLAYABLE), file-size caps, storage keys are server-generated UUIDs (never derived from the uploaded filename), processing happens in the isolated worker process, originals are never publicly served |
| NoSQL injection / XSS | Mongoose's parameterized query builders (no raw string interpolation into queries), Zod validation on every request body/query/param (rejects non-string operator objects like `{"$gt": ""}` before a query is ever built), news content is stored and transmitted as **plain text, never HTML** — there is no server-side HTML sanitizer because there is no server-side HTML to sanitize; Vue's default template auto-escaping renders it safely regardless |
| CSRF | The API is primarily Bearer-token authenticated (a CSRF'd request can't attach a token it doesn't have); the one cookie-driven endpoint, `/auth/refresh`, additionally requires a double-submit CSRF token |
| CORS misconfiguration | `ALLOWED_ORIGINS` is an explicit env-driven allow-list; no wildcard `*` in production; `credentials: true` only for listed origins |
| Path traversal | Object storage keys for uploaded originals are always server-generated UUIDs/derived paths — user-supplied filenames are stored as metadata only. The one place a request param *does* feed into a storage key (`GET /video-stream/:videoId/:quality/:file`) validates `file` against a strict `^[\w.-]+$` allowlist before it's concatenated — `quality` was already constrained to the video's own stored `qualities` array, but `file` wasn't checked at all until Phase 16, so a `%2e%2e%2f`-laden segment name could have walked the S3 key into a different video's prefix within the same bucket despite holding a token scoped to a different `videoId`. Fixed in `videoStream.service.js`. |
| Rate-limit gaps | Distinct limiter configs per sensitive route class: login, password reset, video-token issuance, video-stream requests, analytics ingestion, AI chat, uploads |
| AI endpoint context leakage / abuse | `POST /ai-chat/messages` re-derives the course/topic/video from the database on every request and runs the same accessible-assignment check as video playback, checked before the Anthropic client is even reached — the AI is only ever given context for material the caller actually has active access to; a per-user rate limit (30 req/10min) applies given per-call cost |
| Over-broad employee monitoring | Analytics is scoped to in-platform activity only (spec §43) — no OS-level hooks, no other-tab URLs; users see a monitoring notice describing exactly what's tracked |
| Secret/log leakage | Winston formatter redacts password/token fields before any log line is written; `.env` is git-ignored, `.env.example` documents every required variable with no real secrets committed |
| Expired/overdue course access | `courseAssignment.status` and `deadline`/`expiresAt` are checked server-side on every `video-access` token request — an expired assignment cannot mint a playback token regardless of what the frontend shows |

## Test checklist (executed at Phase 16 — Security Hardening)

Written up as concrete automated/manual test cases once real endpoints
exist to test against: authentication, authorization, IDOR, privilege
escalation, CORS, upload abuse, rate-limiting, JWT/session handling,
expired-course-access, video-token expiration, signed-URL expiration, path
traversal, injection, XSS, CSRF, and file-upload abuse — matching spec §50
one-for-one.
