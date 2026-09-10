import { apiKeyService } from '../services/integrations/apiKey.service.js'
import { redisConnection } from '../config/redis.js'
import { ApiError } from '../utils/ApiError.js'
import { sendError } from '../utils/apiResponse.js'
import { logger } from '../config/logger.js'

/**
 * The door to the public API (11.1).
 *
 * A key is presented as `Authorization: Bearer lms_...` or `X-API-Key`. Both,
 * because integrators' HTTP clients differ and a header name is not worth an
 * afternoon of anybody's time.
 *
 * The middleware then does something worth being explicit about: it puts the
 * key's scopes on `req.user.permissions`, so a public route is gated by
 * exactly the `requirePermission` middleware a private route uses. One
 * implementation of "may this caller do that", whichever door they came
 * through — rather than a second, parallel authorisation check that will
 * eventually disagree with the first.
 *
 * `req.user.id` is the person who created the key, which is what the audit
 * log records. The synthetic role name is `API_KEY` so nothing can mistake
 * it for a session: role-gated routes (`requireRole`) refuse it by
 * construction.
 */
export async function apiKeyAuth(req, res, next) {
  const header = String(req.headers.authorization ?? '')
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const presented = bearer || String(req.headers['x-api-key'] ?? '')

  if (!presented) {
    next(ApiError.unauthorized('An API key is required', 'MISSING_API_KEY'))
    return
  }

  const key = await apiKeyService.verify(presented)
  if (!key) {
    // One message for every failure mode (see apiKeyService.verify).
    next(ApiError.unauthorized('Invalid API key', 'INVALID_API_KEY'))
    return
  }

  req.apiKey = key
  req.user = {
    id: String(key.createdBy),
    roleName: 'API_KEY',
    permissions: key.scopes,
    // A key reads across the company or not at all: scoping a key to one
    // manager's team would be a second, invisible filter on top of its
    // scopes, and an integration silently receiving a subset of the
    // employees is worse than being refused.
    scope: 'ALL',
  }

  apiKeyService.touch(key, req.ip)
  next()
}

/**
 * Per-key rate limiting, counted in Redis (11.1).
 *
 * Not express-rate-limit: its default store is per-process memory, and this
 * API runs in pm2 cluster mode — a 60/minute budget would be 60 × workers
 * in practice, which is not a limit anybody can reason about. A Redis
 * counter with a one-minute expiry is exact across workers and is four
 * lines of Lua-free logic.
 *
 * Fails **open** on a Redis error. The alternative is an integration that
 * stops working because the counter is unavailable, which trades a
 * hypothetical overload for a real outage.
 */
export async function apiKeyRateLimit(req, res, next) {
  const key = req.apiKey
  if (!key) {
    next(ApiError.unauthorized('An API key is required', 'MISSING_API_KEY'))
    return
  }

  const window = Math.floor(Date.now() / 60000)
  const counter = `apikey:rate:${key._id}:${window}`

  try {
    const used = await redisConnection.incr(counter)
    if (used === 1) await redisConnection.expire(counter, 120)

    const limit = key.rateLimitPerMinute ?? 60
    // The headers integrators actually read, so a client can back off
    // before it is refused rather than after.
    res.setHeader('X-RateLimit-Limit', String(limit))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - used)))
    res.setHeader('X-RateLimit-Reset', String((window + 1) * 60))

    if (used > limit) {
      res.setHeader('Retry-After', String(60 - (Math.floor(Date.now() / 1000) % 60)))
      sendError(res, 429, 'RATE_LIMITED', `This key allows ${limit} requests per minute`)
      return
    }
  } catch (error) {
    logger.warn('API key rate limiting is unavailable, allowing the request', { error: error.message })
  }

  next()
}
