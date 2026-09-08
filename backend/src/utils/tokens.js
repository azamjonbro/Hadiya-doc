import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import ms from 'ms'
import { env } from '../config/env.js'
import { resolveRoleScope } from '@lms/shared'

export function generateAccessToken(user, role) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      roleId: role._id.toString(),
      roleName: role.name,
      permissions: role.permissions,
      // Carried on the token so scope costs no query per request. An older
      // token has no `scope`; auth.middleware resolves that from the role
      // name instead, and narrowly (see resolveRoleScope).
      scope: resolveRoleScope(role),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL }
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET)
}

export function generateOpaqueToken() {
  return crypto.randomBytes(64).toString('hex')
}

export function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function refreshTokenExpiryDate() {
  return new Date(Date.now() + ms(env.JWT_REFRESH_TTL))
}
