import { verifyAccessToken } from '../utils/tokens.js'
import { ApiError } from '../utils/ApiError.js'

export function authenticate(req, res, next) {
  const header = req.headers.authorization ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    next(ApiError.unauthorized('Missing or malformed access token', 'MISSING_ACCESS_TOKEN'))
    return
  }

  try {
    const payload = verifyAccessToken(token)
    req.user = {
      id: payload.sub,
      roleId: payload.roleId,
      roleName: payload.roleName,
      permissions: payload.permissions,
    }
    next()
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token', 'INVALID_ACCESS_TOKEN'))
  }
}
