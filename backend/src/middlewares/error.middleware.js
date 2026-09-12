import { ApiError } from '../utils/ApiError.js'
import { sendError } from '../utils/apiResponse.js'
import { logger } from '../config/logger.js'
import { env } from '../config/env.js'
import { reportError, describeRequest } from '../services/alerts/errorAlert.service.js'

// Refusals that are part of normal use, never worth a mail: a wrong
// password, an expired token, a missing row, a throttled client.
const QUIET_STATUSES = new Set([401, 404, 429])
const QUIET_CODES = new Set(['INVALID_CREDENTIALS', 'INVALID_ACCESS_TOKEN', 'REFRESH_EXPIRED', 'ACCOUNT_INACTIVE', 'ROUTE_NOT_FOUND', 'CSRF_INVALID', 'CANCELED'])

function alert(req, { status, code, message, stack, details }) {
  if (QUIET_STATUSES.has(status) || QUIET_CODES.has(code)) return
  if (status < 500 && env.ERROR_ALERT_LEVEL !== 'all') return
  reportError({
    source: 'api',
    status,
    code,
    message,
    stack,
    details: details ? JSON.stringify(details).slice(0, 1500) : '',
    ...describeRequest(req),
  })
}

export function notFoundHandler(req, res) {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`)
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, stack: err.stack, path: req.originalUrl })
    }
    alert(req, { status: err.statusCode, code: err.code, message: err.message, stack: err.stack, details: err.details })
    sendError(res, err.statusCode, err.code, err.message, err.details)
    return
  }

  if (err?.name === 'CastError') {
    alert(req, { status: 400, code: 'INVALID_ID', message: `Invalid identifier: ${err.value}`, stack: err.stack })
    sendError(res, 400, 'INVALID_ID', 'Invalid identifier format')
    return
  }

  if (err?.code === 11000) {
    alert(req, { status: 409, code: 'DUPLICATE_KEY', message: err.message, stack: err.stack })
    sendError(res, 409, 'DUPLICATE_KEY', 'A record with these unique fields already exists')
    return
  }

  const message = err instanceof Error ? err.message : 'Unknown error'
  logger.error(message, {
    stack: err instanceof Error ? err.stack : undefined,
    path: req.originalUrl,
  })
  alert(req, { status: 500, code: 'INTERNAL_ERROR', message, stack: err instanceof Error ? err.stack : '' })
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong')
}
