import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

// Batched client-side (every 5-15s per spec §8), so this only needs to
// tolerate a handful of requests per minute per user, not per-event volume.
export const analyticsIngestRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many analytics events, please try again later'),
})
