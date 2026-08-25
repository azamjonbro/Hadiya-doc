# Face Verification (Daily Face Check)

Confirms the person signing in / about to watch a video is the enrolled
employee — a second, biometric factor layered on top of password login, not
a replacement for it. Off by default (`FACE_VERIFICATION_ENABLED=false`);
see [Rollout](#rollout) before turning it on anywhere.

## What this is not

- **Not the proctoring "foreign face" feature** (`docs/attention-monitoring.md`,
  `ProctorSnapshot`). That asks "did someone else appear on camera *during*
  a video" using only face-count detection, continuously, with no reference
  photo. This feature asks "is the person logging in / about to watch a
  video *the enrolled employee*", once a day, against a stored reference.
  They share nothing at the data layer and only a little at the UI/camera
  layer (see [Shared camera layer](#shared-camera-layer)).
- **Not cryptographic-grade liveness.** The blink/head-turn check client-side
  is a deterrent against a static printed photo, not a guarantee against a
  determined attacker with video playback. Documented limitation, matching
  this project's existing stance on watermarking (deters, does not prevent).

## Flow

```
SUPERADMIN enrolls a reference face (up to 3 photos, averaged into one
descriptor) for an employee
        │
        ▼
Employee logs in with password (unchanged)
        │
        ▼
Password valid + face verification required + not verified yet today?
        │                                              │
       NO                                             YES
        │                                              │
        ▼                                              ▼
  Normal session issued                    { requiresFaceVerification: true,
  (unchanged)                                 verificationToken }
                                                         │
                                              Employee shows their face
                                                         │
                                              POST /auth/face/verify
                                              (verificationToken + photo)
                                                         │
                                          Backend matches against the
                                          enrolled descriptor — PASS/FAIL
                                          decided server-side, always
                                                         │
                                                  PASS → session issued
                                                  FAIL → try again / locked
                                                  out after repeated failures
```

Once verified, the same check gates the first video of the day
(`videoAccessService.issueToken()` — `FACE_VERIFICATION_REQUIRED` 403 until
verified). No second challenge token is minted for that check: the user
already has a full session, so `/auth/face/verify` is called with their
normal bearer token instead.

"Today" is the calendar day in `env.APP_TIMEZONE` (default `Asia/Tashkent`),
computed with `Intl.DateTimeFormat` (`backend/src/utils/timezone.js`) —
correct across DST-observing zones, unlike a fixed-offset subtraction.

## Data model

- **`FaceProfile`** (one per user, `backend/src/models/faceProfile.model.js`):
  `enabled`, `enrolled`, `embedding` (128-float descriptor, `select: false`
  by default — a plain `findOne()` never returns it), `modelVersion`,
  `referenceImageKey`/`referenceImageContentType` (private-bucket photo, kept
  only for SUPERADMIN review), `enrolledAt`/`enrolledBy`, `lastVerifiedAt`,
  `failedAttempts`/`lockedUntil`. A separate collection referencing `userId`
  rather than a sub-document on `User` — same shape as `Session` and
  `ProctorSnapshot` — so the embedding cannot leak through `GET /users/:id`
  or any other user-serialization path by construction.
- **`FaceVerificationChallenge`**: short-lived (`FACE_CHALLENGE_TTL_SECONDS`,
  default 5 min), single-use, user-bound ticket issued by `/auth/login` when
  a face check is still needed. Opaque value, only its SHA-256 hash stored —
  identical pattern to `Session.refreshTokenHash`.

## API

All under `/api/v1/auth/face` (nested inside `authRouter`, so it inherits
the router-wide rate limiter and is covered by the `/api/v1/auth` prefix
that `baseRateLimiter` already exempts — see `rateLimit.middleware.js`).

| Route | Who | Notes |
|---|---|---|
| `POST /enroll` | SUPERADMIN | multipart, up to 3 photos, `userId` field |
| `POST /re-enroll` | SUPERADMIN | same shape; 404 if nothing enrolled yet |
| `POST /verify` | bearer token **or** `verificationToken` | see [authenticateOrFaceChallenge](#the-verify-endpoint) |
| `GET /status` | self | `{ enabled, enrolled, enrolledAt, lastVerifiedAt }` — never the embedding |
| `GET /status/:userId` | SUPERADMIN | same shape, for the admin panel |
| `PATCH /:userId` | SUPERADMIN | `{ enabled }` |
| `GET /:userId/reference-image` | SUPERADMIN | streams the private photo; every view audited |

### The `/verify` endpoint

One route, two ways in (`authenticateOrFaceChallenge.middleware.js`):

- A normal `Authorization: Bearer` header → the video-playback gate, user
  already fully logged in.
- A `verificationToken` field in the multipart body (no bearer header) → the
  mid-login case, resolved against `FaceVerificationChallenge`.

Both paths call the same `faceVerificationService.verify()` core. Only what
happens on a PASS differs: the challenge path consumes the challenge and
calls `issueSession()` — the exact function `login()`/`refresh()` already
use in `auth.service.js` — so there is one token-issuing path in the whole
backend, not two.

## Matching

`backend/src/services/face/faceEmbedding.service.js` — `@vladmandic/face-api`
(SSD Mobilenetv1 detector + 68-point landmarks + a 128-float recognition
descriptor), run **server-side only**. The final PASS/FAIL decision — cosine
similarity against `FACE_MATCH_THRESHOLD` (default 0.55, never sent to the
frontend) — always happens on the backend. A client-computed embedding was
considered and rejected: the browser would then be trusted with the actual
decision input, and a modified client could submit a forged embedding
without ever presenting a face. The browser only ever submits pixels.

Models are self-hosted (`backend/scripts/fetch-face-models.mjs`, run at
`postinstall`, same convention as `front/scripts/fetch-mediapipe-assets.mjs`)
and loaded once into an in-process singleton on first use — never reloaded
per request.

### Platform note — read before running this locally

`@tensorflow/tfjs-node` ships a prebuilt native binary for Linux x64 (this
backend's production target) but **not for macOS**, Apple Silicon included.
Both `@tensorflow/tfjs-node` and `@vladmandic/face-api` are therefore
dynamically imported inside the lazy model-loading singleton, not at module
top level — the rest of the backend boots and runs completely normally on a
Mac dev machine; only actually calling `enroll`/`re-enroll`/`verify` reaches
the native module, failing with a clear `FACE_RUNTIME_UNAVAILABLE` 500
instead of crashing the whole process at boot. `npm install` at the repo
root will still show a `node-gyp` failure for `@tensorflow/tfjs-node` on a
Mac — expected, and harmless as long as `postinstall` doesn't hard-fail the
install (it doesn't; the failure is inside npm's own dependency build step,
which npm reports but does not roll back). The feature works end to end
only where `npm install` runs on Linux — the actual deploy target.

## Rollout

```
FACE_VERIFICATION_ENABLED=false        # master kill-switch
FACE_VERIFICATION_REQUIRED=false       # gates enrolled users once ENABLED
FACE_VERIFICATION_ENFORCE_UNENROLLED=false  # gates unenrolled users too
```

Both default off, so upgrading an existing deployment changes nothing until
an operator opts in. Recommended path: enroll a handful of employees with
`ENABLED=true, REQUIRED=false` (nothing is gated yet, but `/enroll` is
reachable and testable), then flip `REQUIRED=true` once enrollment coverage
is where it needs to be. `ENFORCE_UNENROLLED` stays off until every active
employee is enrolled — flipping it earlier locks out everyone SUPERADMIN
hasn't gotten to yet.

## Security & privacy

- Rate limiting: per-IP (`faceVerifyRateLimiter`, 20 failures/15min, mirrors
  `loginRateLimiter`) **and** per-account lockout (`FaceProfile.failedAttempts`/
  `lockedUntil`, mirrors `user.repository.js`'s `registerFailedLogin`).
  Lockout notifies SUPERADMIN + the employee's department managers, same
  recipient logic as `proctorSnapshot.service.js`'s `notifyReviewers()`.
- Every enrollment, re-enrollment, verification (pass/fail), lockout, and
  reference-photo view is written to `auditLogs` (`FACE_ENROLLMENT_SUCCESS`,
  `FACE_ENROLLMENT_FAILED`, `FACE_VERIFICATION_SUCCESS`,
  `FACE_VERIFICATION_FAILED`, `FACE_RE_ENROLLMENT`, `FACE_VERIFICATION_LOCKED`,
  `FACE_VERIFICATION_ENABLED`/`DISABLED`, `FACE_REFERENCE_IMAGE_VIEWED`).
  Internal failure reasons (`FACE_NOT_DETECTED`, `MULTIPLE_FACES`,
  `FACE_MISMATCH`, `LOW_QUALITY`, ...) live only in audit `metadata` — the
  client-facing message is always the same generic "verification failed."
- Reference photos live in a dedicated private bucket (`S3_BUCKET_FACES`,
  default `lms-faces`) with no public policy and no signed URLs, streamed
  only through the audited `GET /:userId/reference-image` endpoint — same
  treatment as `S3_BUCKET_PROCTOR`.
- ADMIN/MANAGER get no new privilege. Every admin-only face endpoint is
  gated `requireRole(SUPERADMIN)`, not a permission — it stays SUPERADMIN-only
  even if a custom role is later handed every other user-management
  permission.

## Shared camera layer

`front/src/composables/useFaceCamera.js` extracts the camera lifecycle
(`getUserMedia`, off-DOM `<video>`, `start()`/`stop()`, canvas-based JPEG
`grabFrame()`) out of `useAttentionMonitor.js` into a base both attention
monitoring and face enrollment/verification build on — one camera
implementation, not two.

## Troubleshooting

- **"Face verification is unavailable on this server right now"
  (`FACE_RUNTIME_UNAVAILABLE`)** — the model runtime failed to load. On a
  Mac, this is expected (see [Platform note](#platform-note--read-before-running-this-locally)).
  On the Linux server, check that `npm install` actually ran
  `fetch-face-models.mjs` (models present under `backend/models/face-api/`)
  and that `@tensorflow/tfjs-node`'s native binary installed — check the
  backend's boot log for the "Face verification models loaded" line, which
  only appears after the first successful enroll/verify call.
- **Login never asks for a face check** — check `FACE_VERIFICATION_ENABLED`
  and `FACE_VERIFICATION_REQUIRED` are both `true`, and that the user
  actually has an enrolled, enabled `FaceProfile` (`GET /auth/face/status`).
- **A real employee keeps failing verification** — lighting/camera quality
  is the most common cause (`LOW_QUALITY`/`FACE_NOT_DETECTED` in the audit
  log metadata). Re-enrolling with better-lit photos usually fixes it;
  `FACE_MATCH_THRESHOLD` can be lowered slightly as a last resort, but that
  trades off the whole feature's precision.
