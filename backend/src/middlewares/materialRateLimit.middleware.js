import rateLimit from 'express-rate-limit'

// Materials are uploaded far less often than images (imageUploadRateLimit.middleware.js),
// so this is generous.
export const materialUploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

// Mirrors videoTokenRateLimiter — a signed URL per download click.
export const materialDownloadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
})
