import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from './rateLimit.middleware.js'

// Chat is the chattiest endpoint in the product by design, so this is much
// higher than the material/image limiters — it exists to stop a scripted
// flood, not to pace a fast typist.
export const chatSendRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('You are sending messages too quickly, please slow down'),
})

// Attachments are heavier: a voice note per message is plausible, a
// hundred files a minute is not.
export const chatUploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many chat attachments, please try again in a few minutes'),
})
