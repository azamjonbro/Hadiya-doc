import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

export const videoTokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many video access requests, please try again in a few minutes'),
})

// Generous — a single playback session legitimately issues many segment
// requests (every ~6s of video, plus re-requests on seeking).
export const videoStreamRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 4000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many video stream requests, please try again in a few minutes'),
})
