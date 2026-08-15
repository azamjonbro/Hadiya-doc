import crypto from 'node:crypto'
import ms from 'ms'
import { env } from '../config/env.js'

const REFRESH_COOKIE = 'refresh_token'
const CSRF_COOKIE = 'csrf_token'
const REFRESH_COOKIE_PATH = '/api/v1/auth'

function baseCookieOptions() {
  return {
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    // SameSite=None is only honoured on a Secure cookie (env.js refuses to
    // boot with that combination outside production, so this can't silently
    // degrade).
    secure: env.isProduction || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
  }
}

export function setAuthCookies(res, { refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    maxAge: ms(env.JWT_REFRESH_TTL),
  })

  const csrfToken = crypto.randomBytes(32).toString('hex')
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...baseCookieOptions(),
    httpOnly: false,
    path: '/',
    maxAge: ms(env.JWT_REFRESH_TTL),
  })
}

export function clearAuthCookies(res) {
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH })
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions(), path: '/' })
}

export function getRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE]
}
