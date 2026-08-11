import { ApiError } from '../utils/ApiError.js'

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized())
      return
    }
    if (!req.user.permissions?.includes(permission)) {
      next(ApiError.forbidden(`Missing required permission: ${permission}`))
      return
    }
    next()
  }
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
