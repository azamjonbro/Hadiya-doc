import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'

// Tighter than the base limiter (rateLimit.middleware.js) since credential
// stuffing specifically targets this route (spec §35, §50).
// Only *failed* attempts count. Counting successes too meant a shared
// egress IP — one office, one NAT, one VPN — burned the whole 20-request
// budget on people simply signing in, and everyone behind it got 429s at
// the login form for the rest of the window. Credential stuffing is
// unaffected: it is failures by definition, and the per-account lockout
// (LOGIN_MAX_ATTEMPTS / lockedUntil in auth.service.js) still applies on
// top of this per-IP budget.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
})

export const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5,
  delayMs: (hits) => hits * 200,
  skipSuccessfulRequests: true,
})

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})
