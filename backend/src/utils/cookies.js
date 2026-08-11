import crypto from 'node:crypto'
import ms from 'ms'
import { env } from '../config/env.js'

const REFRESH_COOKIE = 'refresh_token'
const CSRF_COOKIE = 'csrf_token'
const REFRESH_COOKIE_PATH = '/api/v1/auth'

function baseCookieOptions() {
  return {
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    secure: env.isProduction,
    sameSite: 'strict',
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
