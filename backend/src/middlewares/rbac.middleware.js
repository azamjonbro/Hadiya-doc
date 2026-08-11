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
