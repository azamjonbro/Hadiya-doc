import rateLimit from 'express-rate-limit'

/**
 * Base limiter applied to every route. Sensitive route classes (login,
 * password reset, video token issuance, video streaming, analytics
 * ingestion, AI chat, upload) get their own tighter limiter alongside this
 * one as each of those routes is built (spec §35).
 */

// ...except the ones whose own limiter is deliberately *higher*, which this
// generic ceiling would otherwise override. HLS playback is the case that
// matters: one lesson issues a manifest, a per-quality playlist and a segment
// request every few seconds, so a couple of videos exhaust a 300/window
// budget on their own — and because this limiter is mounted app-wide, running
// out took down login, the course list and everything else with it.
//
// Prefix-matched against the full path, since this runs before any router.
const SELF_LIMITED_PREFIXES = [
  '/api/v1/video-stream', // videoStreamRateLimiter: 4000 / 15min
  '/api/v1/video-access', // videoTokenRateLimiter:   120 / 15min
  '/api/v1/analytics', // analyticsIngestRateLimiter: 200 / 5min
]

export const baseRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  skip: (req) => SELF_LIMITED_PREFIXES.some((prefix) => req.path.startsWith(prefix)),
  standardHeaders: true,
  legacyHeaders: false,
})
