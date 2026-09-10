import crypto from 'node:crypto'
import { redisConnection } from '../config/redis.js'
import { ApiError } from '../utils/ApiError.js'
import { logger } from '../config/logger.js'
import { errorMessage } from '../utils/errorMessage.js'

/**
 * `Idempotency-Key`: a retry that cannot create a second record (11.5).
 *
 * The case this exists for is not a careless client. It is the ordinary
 * one: a request that succeeded on the server and whose *response* never
 * arrived — a phone that lost signal at the wrong moment, a proxy timeout,
 * a laptop closed mid-submit. The client cannot tell that apart from a
 * request that never landed, so it retries, and without this the retry
 * files a second homework submission, a second event registration, a
 * second assignment.
 *
 * The offline features (BLOK 12) make that the normal path rather than an
 * edge case: a queue drained after reconnecting is a queue of requests
 * whose responses were never seen.
 *
 * **Opt-in per route**, not global. A key on a read changes nothing, and a
 * key on an endpoint that is already idempotent by construction (recording
 * progress on a lesson, say) would only add a Redis round trip and a class
 * of 409 that has no meaning there. Being explicit also means the
 * generated OpenAPI document can say which endpoints honour the header
 * (11.3) — read off the middleware, so it cannot be wrong.
 */

// How long a completed response stays replayable. Twenty-four hours is the
// convention, and it is the right order of magnitude for the case it is
// for: an offline queue drained the next morning.
const DONE_TTL_SECONDS = 24 * 60 * 60

// How long an in-flight marker lives. Short on purpose: if the process
// dies mid-request the marker is all that is left, and a long one would
// block the client's retry — the exact thing this middleware exists to
// make safe — until it expired.
const IN_PROGRESS_TTL_SECONDS = 60

const HEADER = 'idempotency-key'
export const REPLAY_HEADER = 'idempotent-replay'

/**
 * Stable JSON, so the fingerprint of the same payload is the same string.
 *
 * `JSON.stringify` preserves insertion order, so two clients sending the
 * same fields in a different order would look like different requests and
 * be told their key was reused. Sorting the keys removes that.
 */
function fingerprint(body) {
  const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((out, key) => {
          out[key] = stable(value[key])
          return out
        }, {})
    }
    return value
  }
  return crypto.createHash('sha256').update(JSON.stringify(stable(body ?? {}))).digest('hex').slice(0, 32)
}

/**
 * The key's scope — who, where, and which key.
 *
 * The actor is in it because a key is an opaque string the client chose:
 * without the actor, one person's key could replay another person's
 * response to them. The method and path are in it because the same key on
 * a different endpoint is a different operation, and replaying the stored
 * body would answer the wrong question. Anonymous callers are scoped by
 * IP — weaker, but the alternative is a shared namespace where any client
 * can guess at another's key.
 */
export function idempotencyScope(req, key) {
  const actor = req.user?.id ? `u:${req.user.id}` : req.apiKey?.prefix ? `k:${req.apiKey.prefix}` : `ip:${req.ip}`
  // `req.route.path` rather than the concrete URL: a key on
  // `/courses/:id/assignments` for two different courses is two different
  // operations, and the id is in the fingerprint via the params below.
  const route = `${req.method} ${req.baseUrl ?? ''}${req.route?.path ?? req.path}`
  const params = JSON.stringify(req.params ?? {})
  return `idem:${crypto.createHash('sha256').update(`${actor}|${route}|${params}|${key}`).digest('hex').slice(0, 40)}`
}

/**
 * @param {object} [options]
 * @param {boolean} [options.required] — refuse the request when the header
 *   is missing. Off by default: adding idempotency to an endpoint must not
 *   break the clients already calling it.
 */
export function idempotent({ required = false, ttlSeconds = DONE_TTL_SECONDS } = {}) {
  const handler = async (req, res, next) => {
    const key = String(req.headers[HEADER] ?? '').trim()
    if (!key) {
      if (required) {
        return next(ApiError.badRequest('This endpoint needs an Idempotency-Key header', 'IDEMPOTENCY_KEY_REQUIRED'))
      }
      return next()
    }
    // A bound, so a client cannot use the header as free storage.
    if (key.length > 200) {
      return next(ApiError.badRequest('Idempotency-Key is too long (200 characters)', 'IDEMPOTENCY_KEY_INVALID'))
    }

    const scope = idempotencyScope(req, key)
    const print = fingerprint(req.body)

    let existing = null
    try {
      // NX is the whole mechanism: the first request to arrive claims the
      // key, and everything else finds it claimed. Check-then-set would
      // let two concurrent retries both pass the check.
      const claimed = await redisConnection.set(
        scope,
        JSON.stringify({ state: 'IN_PROGRESS', fingerprint: print, at: Date.now() }),
        'EX',
        IN_PROGRESS_TTL_SECONDS,
        'NX'
      )
      if (!claimed) existing = await redisConnection.get(scope)
    } catch (error) {
      // Redis is unavailable. Fail **open**: the alternative is refusing
      // writes the platform can perfectly well perform, trading a rare
      // duplicate for a certain outage. Logged loudly, because a
      // deployment running without this guard should be visible.
      logger.error('Idempotency store unavailable, proceeding without the guard', {
        error: errorMessage(error),
        path: req.originalUrl,
      })
      return next()
    }

    if (existing) {
      let record
      try {
        record = JSON.parse(existing)
      } catch {
        record = null
      }

      // The same key with a different body is a client bug, and a silent
      // replay of the first response would hide it — the second request's
      // author believes their payload was accepted.
      if (record?.fingerprint && record.fingerprint !== print) {
        return next(
          ApiError.conflict(
            'This Idempotency-Key was already used with a different request body',
            'IDEMPOTENCY_KEY_REUSED'
          )
        )
      }

      if (record?.state === 'DONE') {
        // The point of the whole middleware: the retry gets the original
        // answer, and the handler does not run again.
        res.set(REPLAY_HEADER, 'true')
        return res.status(record.status).json(record.body)
      }

      // Still in flight. 409 rather than waiting: holding this request
      // open would tie up a connection for as long as the first one takes,
      // and the client can retry in a moment — which is what
      // `Retry-After` says.
      res.set('Retry-After', '1')
      return next(
        ApiError.conflict('An identical request is still being processed', 'IDEMPOTENCY_IN_PROGRESS')
      )
    }

    // Capture the response by wrapping `res.json` — every response in this
    // API goes through it (`sendSuccess`/`sendError`), so there is one
    // place to intercept rather than a listener guessing at the body.
    const originalJson = res.json.bind(res)
    res.json = (body) => {
      const status = res.statusCode
      // 5xx is never stored, and the claim is released: a transient
      // failure must not be cemented into the answer for the next day —
      // the retry this middleware exists to protect has to be able to
      // actually run. 4xx *is* stored: it is deterministic, and replaying
      // it keeps a broken client from hammering the endpoint.
      const store =
        status < 500
          ? redisConnection.set(
              scope,
              JSON.stringify({ state: 'DONE', fingerprint: print, status, body, at: Date.now() }),
              'EX',
              ttlSeconds
            )
          : redisConnection.del(scope)

      store.catch((error) => {
        // The response still goes out: the write happened, and failing the
        // request now would tell the client the opposite.
        logger.error('Could not record an idempotent response', {
          error: errorMessage(error),
          path: req.originalUrl,
        })
      })
      return originalJson(body)
    }

    return next()
  }

  // Read by the OpenAPI generator (11.3), so the document says which
  // endpoints honour the header without anybody maintaining a list.
  handler.openapi = { kind: 'idempotency', required }
  return handler
}
