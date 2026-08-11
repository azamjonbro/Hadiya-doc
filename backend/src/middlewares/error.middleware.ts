import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../utils/ApiError.js'
import { sendError } from '../utils/apiResponse.js'
import { logger } from '../config/logger.js'

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, stack: err.stack, path: req.originalUrl })
    }
    sendError(res, err.statusCode, err.code, err.message)
    return
  }

  const message = err instanceof Error ? err.message : 'Unknown error'
  logger.error(message, {
    stack: err instanceof Error ? err.stack : undefined,
    path: req.originalUrl,
  })
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong')
}
