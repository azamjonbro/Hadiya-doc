import { ApiError } from '../utils/ApiError.js'

/**
 * The gates are tagged with what they require (11.3), for the same reason
 * the validators are: `/openapi.json` is generated from the router stack,
 * and "which permission does this endpoint need" is the question an
 * integrator asks first. Read off the real gate, it cannot be out of date.
 */
function tag(handler, meta) {
  handler.openapi = meta
  return handler
}

export function requirePermission(permission) {
  return tag((req, res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized())
      return
    }
    if (!req.user.permissions?.includes(permission)) {
      next(ApiError.forbidden(`Missing required permission: ${permission}`))
      return
    }
    next()
  }, { kind: 'permission', permissions: [permission], mode: 'all' })
}

/**
 * Any one of these permissions opens the route.
 *
 * Spelled as its own function rather than as rest arguments on
 * requirePermission, because `requirePermission(a, b)` reads just as easily
 * as "needs both" — and a gate whose meaning depends on how the reader
 * guesses is the wrong kind of gate.
 *
 * The case it exists for: a resource two different permissions can reach for
 * two different reasons. Reading a report on screen is `report:view`; taking
 * a copy away is `report:export`, and someone who may take a copy may
 * obviously also look.
 */
export function requireAnyPermission(...permissions) {
  return tag((req, res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized())
      return
    }
    if (!permissions.some((permission) => req.user.permissions?.includes(permission))) {
      next(ApiError.forbidden(`Missing required permission: one of ${permissions.join(', ')}`))
      return
    }
    next()
  }, { kind: 'permission', permissions, mode: 'any' })
}

// Gates on the role itself rather than on a permission — for the handful of
// irreversible operations that stay with SUPERADMIN even if the matching
// permission gets handed to a custom role.
export function requireRole(...roles) {
  return tag((req, res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized())
      return
    }
    const held = req.user.roleNames ?? [req.user.roleName]
    if (!held.some((name) => roles.includes(name))) {
      next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`))
      return
    }
    next()
  }, { kind: 'role', roles })
}

// Allows a user to act on their own resource (req.params[idParam] === their
// id) without any special permission, OR requires the given permission for
// acting on someone else's — e.g. "view your own course list, or any
// user's if you hold user:read".
export function requireSelfOrPermission(idParam, permission) {
  return (req, res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized())
      return
    }
    if (req.params[idParam] === req.user.id) {
      next()
      return
    }
    if (!req.user.permissions?.includes(permission)) {
      next(ApiError.forbidden(`Missing required permission: ${permission}`))
      return
    }
    next()
  }
}
