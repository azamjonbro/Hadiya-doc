/**
 * `code` is the part clients act on: the SPAs translate it (see
 * front/src/utils/apiError.js), so the English `message` is a developer-facing
 * fallback, not what a user is meant to read. `details` carries whatever the
 * translated sentence needs to interpolate — a count, a limit, a list of
 * accepted types — because a number baked into the English string cannot be
 * recovered on the other side.
 */
export class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Error.captureStackTrace?.(this, ApiError)
  }

  static badRequest(message, code = 'BAD_REQUEST', details = null) {
    return new ApiError(400, code, message, details)
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED', details = null) {
    return new ApiError(401, code, message, details)
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN', details = null) {
    return new ApiError(403, code, message, details)
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND', details = null) {
    return new ApiError(404, code, message, details)
  }

  static conflict(message, code = 'CONFLICT', details = null) {
    return new ApiError(409, code, message, details)
  }

  static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED', details = null) {
    return new ApiError(429, code, message, details)
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR', details = null) {
    return new ApiError(500, code, message, details)
  }

  /**
   * Somebody else's server failed, not ours (11.4).
   *
   * Distinct from `internal` on purpose: a 500 sends whoever is on call
   * looking through our logs, while a 502 says the identity provider (or
   * another upstream) answered badly — a different person fixes it, and a
   * retry may well succeed.
   */
  static badGateway(message = 'Upstream service failed', code = 'BAD_GATEWAY', details = null) {
    return new ApiError(502, code, message, details)
  }

  /**
   * The feature exists but is not configured or is switched off.
   *
   * 503 rather than 404: the endpoint is real, and telling a caller "no
   * such route" would send them looking for a typo instead of at the
   * setting that is empty.
   */
  static serviceUnavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE', details = null) {
    return new ApiError(503, code, message, details)
  }
}
