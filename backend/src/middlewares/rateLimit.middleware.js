import rateLimit from 'express-rate-limit'
import { sendError } from '../utils/apiResponse.js'

/**
 * Base limiter applied to every route. Sensitive route classes (login,
 * password reset, video token issuance, video streaming, analytics
 * ingestion, AI chat, upload) get their own tighter limiter alongside this
 * one as each of those routes is built (spec §35).
 */

// express-rate-limit's default response is `text/plain` ("Too many requests,
// please try again later."), which breaks the API's error envelope: the
// clients read `error.response.data.message`, get `undefined` on a plain
// string body, and fall back to their generic per-screen message. On the
// login form that fallback reads "wrong login or password" — telling a
// rate-limited user their correct credentials are wrong. Every limiter below
// (and in the sibling *RateLimit.middleware.js files) passes this handler so
// a 429 is as readable as any other API error.
export function rateLimitHandler(message) {
  return (req, res) => sendError(res, 429, 'RATE_LIMITED', message)
}

// ...except the ones whose own limiter is deliberately *higher*, which this
// generic ceiling would otherwise override. HLS playback is the case that
// matters: one lesson issues a manifest, a per-quality playlist and a segment
// request every few seconds, so a couple of videos exhaust a 300/window
// budget on their own — and because this limiter is mounted app-wide, running
// out took down login, the course list and everything else with it.
//
// Auth is on the list for the mirror-image reason: it must survive the
// general budget running out. Everything else in the app is reachable only
// *after* signing in, so an exhausted 300/window bucket — burned by a busy
// session, a shared office IP, or a page that fans out one request per
// course — used to lock the user out of the one endpoint that could recover
// the session, with no way back in until the window rolled over. The auth
// router carries its own limiters (authRateLimiter over the whole router,
// plus the tighter loginRateLimiter/passwordResetRateLimiter), so dropping
// it from the shared bucket loosens nothing.
//
// Prefix-matched against the full path, since this runs before any router.
const SELF_LIMITED_PREFIXES = [
  '/api/v1/auth', // authRateLimiter:          200 / 15min (login: 20 failures)
  '/api/v1/video-stream', // videoStreamRateLimiter: 4000 / 15min
  '/api/v1/video-access', // videoTokenRateLimiter:   120 / 15min
  '/api/v1/analytics', // analyticsIngestRateLimiter: 200 / 5min
]

// 1200, not 300: an admin page makes five to ten calls, and a quarter
// hour of ordinary clicking through the panel tripped the old cap (found
// crawling the admin as one person on 2026-09-11) — a limiter that stops
// the operator is not protecting anything.
export const baseRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  skip: (req) => SELF_LIMITED_PREFIXES.some((prefix) => req.path.startsWith(prefix)),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests, please try again in a few minutes'),
})
