import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

// Mirrors loginRateLimiter's shape (spec §35 — every biometric/auth-adjacent
// endpoint gets its own budget): per-IP, only failures count, so a shared
// office egress IP can't lock out everyone's legitimate daily check. The
// per-account lockout (FaceProfile.lockedUntil, see faceVerification.service.js)
// is the layer that actually stops repeated guessing against one account.
export const faceVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many face verification attempts, please try again in a few minutes'),
})
