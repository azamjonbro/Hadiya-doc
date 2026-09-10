import 'dotenv/config'
import { z } from 'zod'

// z.coerce.boolean() is a trap for env flags: it runs JS `Boolean(value)`,
// so the string "false" — non-empty — coerces to `true`. This reads the
// literal words instead.
const booleanFlag = (defaultValue) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((v) => v === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Behind nginx in production the process must not be reachable from the
  // internet directly — binding loopback is what keeps TLS, rate limiting and
  // the security headers from being bypassable on :4000.
  HOST: z.string().default('0.0.0.0'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  // No feature needed a configured timezone before face verification's
  // once-a-day boundary — introduced here rather than hardcoded so it can be
  // corrected without a code change if the deployment ever isn't Tashkent.
  APP_TIMEZONE: z.string().default('Asia/Tashkent'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CSRF_SECRET: z.string().min(16, 'CSRF_SECRET must be at least 16 characters'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  // 'strict' is right whenever the SPAs and the API share a registrable
  // domain (app.example.com + api.example.com). Set 'none' only when they
  // genuinely cannot — a frontend on *.vercel.app or *.netlify.app talking
  // to an API elsewhere is cross-site, and a 'strict'/'lax' refresh cookie
  // is simply never attached to POST /auth/refresh, so every session dies
  // at the access token's TTL and can never be restored.
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  SUPERADMIN_EMAIL: z.string().email('SUPERADMIN_EMAIL must be a valid email'),
  // Optional rather than required so an install that predates the JSHSHIR
  // migration still boots — its SUPERADMIN already exists and the seed is
  // skipped. A *fresh* install without it fails in seedRolesAndSuperAdmin.js
  // with an actionable message instead of taking the whole process down here.
  SUPERADMIN_JSHSHIR: z
    .string()
    .regex(/^\d{14}$/, 'SUPERADMIN_JSHSHIR must be exactly 14 digits')
    .optional(),
  SUPERADMIN_PASSWORD: z.string().min(8, 'SUPERADMIN_PASSWORD must be at least 8 characters'),

  CAPTCHA_PROVIDER: z.enum(['hcaptcha']).default('hcaptcha'),
  CAPTCHA_SECRET: z.string().optional().default(''),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

  // Master kill-switch + rollout gates for daily face verification. Default
  // off end to end, so upgrading an existing deployment never changes login
  // or video-playback behavior until an operator opts in deliberately.
  FACE_VERIFICATION_ENABLED: booleanFlag(false),
  // Once enabled, gates users SUPERADMIN has actually enrolled. Unenrolled
  // users are left alone unless FACE_VERIFICATION_ENFORCE_UNENROLLED is also
  // set — flipping that on a rollout day one would lock out every employee
  // nobody has enrolled yet.
  FACE_VERIFICATION_REQUIRED: booleanFlag(false),
  FACE_VERIFICATION_ENFORCE_UNENROLLED: booleanFlag(false),
  // Cosine similarity floor for a match. Never sent to the frontend.
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
  // How recent a check has to be when the "verify before every video and
  // material" setting is on (facePolicy.service.js). Only consulted in that
  // mode — the default cadence is once per local day.
  FACE_VERIFICATION_FRESH_SECONDS: z.coerce.number().int().positive().default(120),
  FACE_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  FACE_VERIFICATION_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  FACE_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  STORAGE_DRIVER: z.enum(['s3']).default('s3'),
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT is required'),
  S3_REGION: z.string().min(1, 'S3_REGION is required'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  S3_BUCKET_ORIGINALS: z.string().min(1, 'S3_BUCKET_ORIGINALS is required'),
  S3_BUCKET_PROCESSED: z.string().min(1, 'S3_BUCKET_PROCESSED is required'),
  // Unlike the video buckets (private, served only via signed playback
  // tokens), this one is public-read — avatars/covers/news images are
  // rendered directly via <img src> throughout the app, same as the
  // plain-URL fields already on the Course/News/User models.
  S3_BUCKET_IMAGES: z.string().min(1, 'S3_BUCKET_IMAGES is required'),
  // Optional — lets a production deploy serve images from a CDN/public
  // domain that differs from the internal S3_ENDPOINT. Defaults to
  // constructing the URL from S3_ENDPOINT directly (fine for local dev).
  // Host the browser will use for presigned links. Separate from S3_ENDPOINT
  // on purpose: a presigned URL's signature covers the host and path, so it
  // has to be signed for the address the browser actually calls — while every
  // server-side read and write keeps going over loopback. Pointing
  // S3_ENDPOINT itself at the public name would send video segments out to
  // the internet and back for no reason. Empty = sign with S3_ENDPOINT.
  S3_SIGNING_ENDPOINT: z.string().optional().default(''),
  S3_PUBLIC_URL: z.string().optional().default(''),

  // Private bucket — course materials (files/presentations/multimedia) are
  // only ever served via a short-lived signed URL, never a plain public one
  // (see materialAccess.service.js), unlike S3_BUCKET_IMAGES above.
  S3_BUCKET_MATERIALS: z.string().min(1, 'S3_BUCKET_MATERIALS is required'),
  MATERIAL_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(100),
  MATERIAL_DOWNLOAD_URL_TTL: z.coerce.number().int().positive().default(120),

  // SCORM packages (9.3). Its own private bucket rather than a prefix inside
  // lms-materials: a package is not one file but a whole extracted website —
  // hundreds of objects under `<packageId>/` — and mixing that into the
  // bucket the material viewer lists would make "what files does this
  // course have" an unanswerable question. Defaulted so an existing
  // deployment does not fail boot before its env file is touched.
  S3_BUCKET_SCORM: z.string().min(1).default('lms-scorm'),
  // How long an object has to be untouched before the orphan sweep will
  // consider deleting it (9.5). Uploads write the object first and the
  // referencing row second, so a sweep with no grace period would delete a
  // file whose row lands a moment later — the one failure that loses work
  // instead of reclaiming space. A week, because a course being built over
  // a weekend is normal.
  MEDIA_ORPHAN_GRACE_DAYS: z.coerce.number().int().min(1).default(7),
  // The nightly sweep reports by default and deletes only when this is on.
  // Same shape as BACKUP_ENABLED, and for the same reason: a destructive
  // scheduled job should be a decision somebody made, not a default.
  MEDIA_CLEANUP_DELETE: z.coerce.boolean().default(false),
  // How long a webhook delivery may take before it is treated as failed
  // (11.2). Short on purpose: a receiver that takes ten seconds to answer
  // is a receiver doing its work inline instead of queueing it, and the
  // worker holding that connection open is not delivering anything else.
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  // Whether a webhook may point at a private address, and whether http is
  // allowed at all. The endpoint URL is operator-supplied and the request
  // leaves from inside the network, so without this guard the platform can
  // be aimed at 169.254.169.254 or a neighbour site on loopback — and it
  // signs the request on the way (see webhookTarget.js). Left unset it
  // follows NODE_ENV: on in development and tests, where the receiver is a
  // local server, off in production. Explicit `true` in production is a
  // decision somebody has to write down.
  WEBHOOK_ALLOW_PRIVATE_TARGETS: z.enum(['true', 'false']).optional(),
  // Bigger than a material: a Storyline or iSpring export with narration
  // routinely passes 100 MB. Extraction happens in the worker, not in the
  // request, so the ceiling is worker memory rather than request latency.
  SCORM_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(300),
  // How long a launch token is good for. Long enough for a sitting with a
  // long video in it; the token only ever grants this one package to this
  // one person, and the state endpoints re-check both.
  SCORM_LAUNCH_TOKEN_TTL: z.string().default('4h'),

  // Private bucket as well — a chat image/voice note/file is private
  // correspondence between two people, so it is only ever served through a
  // short-lived signed URL minted per message render. Defaulted (unlike
  // the buckets above) so an existing deployment does not fail boot when
  // it upgrades before touching its env file.
  // Proctoring snapshots. Deliberately its own bucket: it is the only one
  // holding photographs of people, and it must never pick up the public-read
  // policy that the images bucket has.
  S3_BUCKET_PROCTOR: z.string().default('lms-proctor'),
  // Face enrollment reference photos. Its own bucket, private like
  // lms-proctor and for the same reason: this is the most sensitive
  // biometric data in the system and deserves at least the same isolation.
  S3_BUCKET_FACES: z.string().default('lms-faces'),
  S3_BUCKET_CHAT: z.string().min(1).default('lms-chat'),
  CHAT_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(25),
  // Longer than the material TTL: an image sits rendered in a scrollback
  // the reader may leave open, and a 2-minute URL would break on scroll-up.
  CHAT_ATTACHMENT_URL_TTL: z.coerce.number().int().positive().default(3600),

  // Web push (VAPID). Empty = push is off, like SMTP: no keys, no attempt.
  // Generate a pair once with:
  //   node -e "console.log(require('web-push').generateVAPIDKeys())"
  // The public key is handed to browsers; the private one never leaves the
  // server, and rotating it invalidates every existing subscription.
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  // Identifies us to the push service so it has someone to contact about
  // abuse. The spec wants a mailto: or an https: URL.
  VAPID_SUBJECT: z.string().optional().default(''),

  // Where the SPA is served. Notification emails end with a link to it —
  // the one thing a mail must carry that the in-app version does not, since
  // the reader is not already in the app. Empty renders the link as nothing
  // rather than as a broken localhost URL.
  APP_URL: z.string().optional().default(''),

  // The absolute base URL an integration should call, listed in
  // `/openapi.json` alongside the relative one (11.3). Optional, and
  // *never* derived from the request: behind the Cloudflare tunnel
  // `X-Forwarded-Proto` says http on an https deployment, so a document
  // built from headers would hand every integrator http:// URLs that die
  // in a redirect.
  API_PUBLIC_URL: z.string().optional().default(''),

  // Outbound email. Empty SMTP_HOST = mail is not configured: every send is
  // recorded as SKIPPED and nothing else changes, so a laptop and a day-one
  // install both work. It is not an error state.
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // true = implicit TLS (port 465). false = start plaintext on 587 and
  // upgrade with STARTTLS, which is what most relays want.
  SMTP_SECURE: booleanFlag(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  // The From: header. Required alongside SMTP_HOST — a relay will reject a
  // message with no sender, and finding that out per-message in a retry loop
  // is worse than finding it out at boot.
  MAIL_FROM: z.string().optional().default(''),

  // Error tracking (Sentry or a self-hosted GlitchTip — same ingest API).
  // Empty = disabled, which is the default: no DSN, no outbound calls.
  SENTRY_DSN: z.string().optional().default(''),
  // Defaults to NODE_ENV. Set it when several deployments share one project
  // and you need "staging" separated from "production" in the issue list.
  SENTRY_ENVIRONMENT: z.string().optional().default(''),
  // A build identifier (commit sha) so an issue says which deploy it came
  // from. Optional — without it every event lands in one undifferentiated
  // stream, which is still useful, just harder to bisect.
  SENTRY_RELEASE: z.string().optional().default(''),

  // Nightly encrypted mongodump to object storage. Off by default: it needs
  // a key an operator has to generate, and a backup job that runs without
  // one would only produce a nightly error, which is worse than an explicit
  // opt-in. Production boots with a warning when it is off (see below).
  BACKUP_ENABLED: booleanFlag(false),
  // 32 bytes, hex. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // Losing it makes every stored archive unreadable, so it belongs in the
  // password manager, NOT only in this file on the box being backed up.
  BACKUP_ENCRYPTION_KEY: z.string().optional().default(''),
  S3_BUCKET_BACKUPS: z.string().min(1).default('lms-backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  // Cron, in APP_TIMEZONE. Default 03:20 — off the hour, because every other
  // cron on a shared box fires at :00.
  BACKUP_SCHEDULE_CRON: z.string().default('20 3 * * *'),
  // mongodump/mongorestore are separate from the mongo server package and
  // are frequently absent from a PM2 process's PATH even when they are on
  // the operator's. Overridable with an absolute path.
  MONGODUMP_BIN: z.string().default('mongodump'),
  MONGORESTORE_BIN: z.string().default('mongorestore'),

  VIDEO_TOKEN_SECRET: z.string().min(16, 'VIDEO_TOKEN_SECRET must be at least 16 characters'),
  VIDEO_PLAYBACK_TOKEN_TTL: z.coerce.number().int().positive().default(180),

  // Optional — the AI chat feature (Phase 13) degrades to a clear 503 at
  // request time rather than failing boot when this isn't configured.
  ANTHROPIC_API_KEY: z.string().optional().default(''),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const isProduction = parsed.data.NODE_ENV === 'production'

// Browsers drop a SameSite=None cookie that is not also Secure, silently —
// the Set-Cookie simply never lands, and the symptom is an auth loop with
// nothing in the logs. Refuse to boot in that configuration rather than
// ship an app whose sessions cannot survive a refresh.
if (parsed.data.COOKIE_SAMESITE === 'none' && !isProduction) {
  console.error(
    'Invalid environment configuration: COOKIE_SAMESITE=none requires Secure cookies, ' +
      'which are only sent when NODE_ENV=production. Use a same-site domain layout in ' +
      'development, or run with NODE_ENV=production behind HTTPS.'
  )
  process.exit(1)
}

// A presigned URL is signed for one host, and nothing downstream re-checks
// that the host is still ours: the link is minted happily, the browser gets a
// 200-shaped promise, and the request dies in DNS. That is how every audio
// material and every download button broke after the deploy moved domains —
// the signing host kept pointing at the retired one for a week without a
// single log line. So: refuse an unparseable value, refuse a loopback one in
// production (that is the bug this variable exists to prevent), and warn when
// it shares no registrable domain with the origins the app is served on,
// which is what a stale host looks like.
if (parsed.data.S3_SIGNING_ENDPOINT) {
  let signingUrl
  try {
    signingUrl = new URL(parsed.data.S3_SIGNING_ENDPOINT)
  } catch {
    console.error(
      'Invalid environment configuration: S3_SIGNING_ENDPOINT must be an absolute URL ' +
        `(got "${parsed.data.S3_SIGNING_ENDPOINT}"), e.g. https://api.example.com`
    )
    process.exit(1)
  }

  const isLoopback = ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(signingUrl.hostname)
  if (isProduction && isLoopback) {
    console.error(
      'Invalid environment configuration: S3_SIGNING_ENDPOINT points at ' +
        `${signingUrl.hostname}, which no browser can reach. Set it to the public host ` +
        'that proxies the storage buckets, or leave it empty to sign with S3_ENDPOINT.'
    )
    process.exit(1)
  }

  const registrableDomain = (hostname) => hostname.split('.').slice(-2).join('.')
  const appDomains = new Set(
    parsed.data.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => {
        try {
          return registrableDomain(new URL(origin).hostname)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
  )
  if (isProduction && appDomains.size && !appDomains.has(registrableDomain(signingUrl.hostname))) {
    console.warn(
      `Warning: S3_SIGNING_ENDPOINT (${signingUrl.host}) shares no domain with ALLOWED_ORIGINS ` +
        `(${[...appDomains].join(', ')}). If this is not a deliberate CDN, presigned links for ` +
        'materials and chat attachments are being signed for the wrong host and will not load. ' +
        'Verify with: node src/scripts/checkStorageSigning.js'
    )
  }
}

// One VAPID key without the other cannot sign anything, and the failure
// would appear per-notification rather than at boot.
if (Boolean(parsed.data.VAPID_PUBLIC_KEY) !== Boolean(parsed.data.VAPID_PRIVATE_KEY)) {
  console.error(
    'Invalid environment configuration: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together. ' +
      'Generate a pair with:\n' +
      '  node -e "console.log(require(\'web-push\').generateVAPIDKeys())"'
  )
  process.exit(1)
}

// Half-configured SMTP is the worst of both: the app believes it can send,
// every message is attempted, and the relay rejects all of them. Refuse the
// half state at boot; refusing to send at all (SMTP_HOST empty) stays fine.
if (parsed.data.SMTP_HOST && !parsed.data.MAIL_FROM) {
  console.error(
    'Invalid environment configuration: SMTP_HOST is set but MAIL_FROM is empty. ' +
      'Set the From: address the relay will accept, e.g. MAIL_FROM="Qo\'llanma <no-reply@example.uz>".'
  )
  process.exit(1)
}

// A backup job with no key encrypts nothing and uploads nothing; it would
// just fail nightly in a log nobody reads. Fail at boot instead, where the
// person who flipped the flag is still watching.
if (parsed.data.BACKUP_ENABLED && !/^[0-9a-fA-F]{64}$/.test(parsed.data.BACKUP_ENCRYPTION_KEY)) {
  console.error(
    'Invalid environment configuration: BACKUP_ENABLED=true requires BACKUP_ENCRYPTION_KEY ' +
      'to be 64 hex characters (32 bytes). Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
      'and store it somewhere that survives the loss of this machine.'
  )
  process.exit(1)
}

if (isProduction && !parsed.data.BACKUP_ENABLED) {
  console.warn(
    'Warning: BACKUP_ENABLED is false — no database backup is being taken. ' +
      'See docs/deployment.md §5 (Backup and restore).'
  )
}

if (parsed.data.FACE_VERIFICATION_REQUIRED && !parsed.data.FACE_VERIFICATION_ENABLED) {
  console.error(
    'Invalid environment configuration: FACE_VERIFICATION_REQUIRED=true requires ' +
      'FACE_VERIFICATION_ENABLED=true.'
  )
  process.exit(1)
}

export const env = {
  ...parsed.data,
  // Unset means "follow NODE_ENV" — see the field's comment above.
  WEBHOOK_ALLOW_PRIVATE_TARGETS:
    parsed.data.WEBHOOK_ALLOW_PRIVATE_TARGETS === undefined
      ? !isProduction
      : parsed.data.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true',
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction,
}
