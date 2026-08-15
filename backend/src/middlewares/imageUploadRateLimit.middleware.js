import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

// Distinct from uploadRateLimit.middleware.js (video/tus, much larger and
// rarer) — image uploads are small and frequent (avatar, course cover,
// news images), but still capped per spec §35.
export const imageUploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Image upload limit reached, please try again in a few minutes'),
})
