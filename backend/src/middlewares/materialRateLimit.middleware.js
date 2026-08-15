import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

// Materials are uploaded far less often than images (imageUploadRateLimit.middleware.js),
// so this is generous.
export const materialUploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Material upload limit reached, please try again in a few minutes'),
})

// Mirrors videoTokenRateLimiter — a signed URL per download click.
export const materialDownloadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many download requests, please try again in a few minutes'),
})
