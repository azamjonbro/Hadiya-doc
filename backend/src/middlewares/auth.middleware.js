import { verifyAccessToken } from '../utils/tokens.js'
import { ApiError } from '../utils/ApiError.js'
import { resolveRoleScope } from '@lms/shared'

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
      roleNames: payload.roleNames ?? [payload.roleName],
      permissions: payload.permissions,
      // A token issued before 2.2 carries no scope. Resolved from the role
      // name rather than defaulted to ALL: for the fifteen minutes those
      // tokens stay valid, an unknown role has to read as narrow, not wide.
      scope: payload.scope ?? resolveRoleScope(payload.roleName),
    }
    next()
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token', 'INVALID_ACCESS_TOKEN'))
  }
}

// Tagged so the generated OpenAPI document can say which endpoints need a
// session token, read from the actual chain rather than from a list
// somebody maintains beside it (11.3).
authenticate.openapi = { kind: 'security', scheme: 'bearerAuth' }
