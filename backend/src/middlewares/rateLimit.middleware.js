import rateLimit from 'express-rate-limit'

/**
 * Base limiter applied to every route. Sensitive route classes (login,
 * password reset, video token issuance, video streaming, analytics
 * ingestion, AI chat, upload) get their own tighter limiter alongside this
 * one as each of those routes is built (spec §35).
 */
export const baseRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
})
