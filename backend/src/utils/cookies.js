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

// Returns the CSRF token it issued. The double-submit check needs the caller
// to echo that value back in a header, and a cross-origin SPA cannot read the
// cookie to find it: the cookie belongs to the API's host, not the SPA's. So
// the token also travels in the login/refresh response body, and the SPA keeps
// it in storage on its own origin — still unreadable to any other site, which
// is all the double-submit check actually relies on.
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

  return csrfToken
}

export function clearAuthCookies(res) {
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH })
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions(), path: '/' })
}

export function getRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE]
}
