import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

/**
 * The public verification endpoint has no login, so the rate limit is the
 * only thing standing between a serial and a script.
 *
 * Ten a minute per IP (AT-12). Generous for the real use — somebody with a
 * printed certificate checks one — and far too slow to be worth walking a
 * keyspace with, which is the attack the random serial already makes
 * impractical. Two defences, because either alone is a single point.
 */
export const publicCertificateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many verification requests, please try again in a minute'),
})
