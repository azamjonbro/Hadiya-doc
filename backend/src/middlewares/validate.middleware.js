import { ApiError } from '../utils/ApiError.js'

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      next(ApiError.badRequest(firstIssue?.message ?? 'Invalid request body', 'VALIDATION_ERROR'))
      return
    }
    req.body = result.data
    next()
  }
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      next(ApiError.badRequest(firstIssue?.message ?? 'Invalid query parameters', 'VALIDATION_ERROR'))
      return
    }
    req.validatedQuery = result.data
    next()
  }
}

// Path segments the router already matched as strings. Unlike the two above
// this only checks the value against a known set, so there is nothing to write
// back — `req.params` is left exactly as Express built it.
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      next(ApiError.badRequest(firstIssue?.message ?? 'Invalid path parameters', 'VALIDATION_ERROR'))
      return
    }
    next()
  }
}
