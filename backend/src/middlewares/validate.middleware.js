import { ApiError } from '../utils/ApiError.js'

/**
 * Each of these returns a closure, and the closure is **tagged with the
 * schema it checks** (11.3).
 *
 * That tag is what lets `/openapi.json` be generated from the routers
 * themselves instead of from a second, hand-written description of them.
 * A document maintained by hand beside the code is a document that is
 * wrong within a month — the request shape is right here in the middleware
 * chain, so the generator reads it from there and cannot drift.
 */
function tag(handler, kind, schema) {
  handler.openapi = { kind, schema }
  return handler
}

export function validateBody(schema) {
  return tag((req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      next(ApiError.badRequest(firstIssue?.message ?? 'Invalid request body', 'VALIDATION_ERROR'))
      return
    }
    req.body = result.data
    next()
  }, 'body', schema)
}

export function validateQuery(schema) {
  return tag((req, res, next) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      next(ApiError.badRequest(firstIssue?.message ?? 'Invalid query parameters', 'VALIDATION_ERROR'))
      return
    }
    req.validatedQuery = result.data
    next()
  }, 'query', schema)
}

// Path segments the router already matched as strings. Unlike the two above
// this only checks the value against a known set, so there is nothing to write
// back — `req.params` is left exactly as Express built it.
export function validateParams(schema) {
  return tag((req, res, next) => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      next(ApiError.badRequest(firstIssue?.message ?? 'Invalid path parameters', 'VALIDATION_ERROR'))
      return
    }
    next()
  }, 'params', schema)
}
