import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

// Spec §20/§26 explicitly calls for the AI endpoint to be protected from
// abuse — each Claude call has real cost, unlike the rest of the API.
// Keyed by user (falls back to IP pre-auth) rather than just IP, since
// office traffic can share a NAT'd address.
export const aiChatRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler('AI chat limit reached, please try again in a few minutes'),
})
