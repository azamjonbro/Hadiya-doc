import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import ms from 'ms'
import { env } from '../config/env.js'

export function generateAccessToken(user, role) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      roleId: role._id.toString(),
      roleName: role.name,
      permissions: role.permissions,
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
