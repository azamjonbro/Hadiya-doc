import rateLimit from 'express-rate-limit'

// A single large video is many chunked PATCH requests (tus-js-client splits
// into ~5-50MB pieces), so this needs a much higher ceiling than the base
// limiter — generous enough for legitimate multi-GB uploads, still bounded
// against abuse.
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
})
