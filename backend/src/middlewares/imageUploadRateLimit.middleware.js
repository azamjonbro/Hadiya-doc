import rateLimit from 'express-rate-limit'

// Distinct from uploadRateLimit.middleware.js (video/tus, much larger and
// rarer) — image uploads are small and frequent (avatar, course cover,
// news images), but still capped per spec §35.
export const imageUploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})
