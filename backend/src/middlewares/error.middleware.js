import { ApiError } from '../utils/ApiError.js'
import { sendError } from '../utils/apiResponse.js'
import { logger } from '../config/logger.js'

export function notFoundHandler(req, res) {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`)
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, stack: err.stack, path: req.originalUrl })
    }
    sendError(res, err.statusCode, err.code, err.message)
    return
  }

  if (err?.name === 'CastError') {
    sendError(res, 400, 'INVALID_ID', 'Invalid identifier format')
    return
  }

  if (err?.code === 11000) {
    sendError(res, 409, 'DUPLICATE_KEY', 'A record with these unique fields already exists')
    return
  }

  const message = err instanceof Error ? err.message : 'Unknown error'
  logger.error(message, {
    stack: err instanceof Error ? err.stack : undefined,
    path: req.originalUrl,
  })
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong')
}
