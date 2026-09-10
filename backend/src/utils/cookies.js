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
  // Scoped to the auth path, not to the whole origin (9.3).
  //
  // This cookie is deliberately readable by JavaScript — that is what makes
  // the double-submit check work — and the SCORM runtime serves uploaded
  // course packages from this same origin. A package is a website somebody
  // else authored: with the cookie at `/` it could read `document.cookie`,
  // echo the value into an `x-csrf-token` header, and POST /auth/refresh —
  // the refresh cookie travels automatically — walking out with a live
  // access token for whoever was taking the course.
  //
  // The path fixes that without weakening anything: `document.cookie` only
  // exposes cookies whose path prefixes the *reading* document's path, while
  // a request to /api/v1/auth/refresh still carries it. So the API keeps
  // getting it and content under /api/v1/scorm cannot see it.
  //
  // The consequence is that http.js's cookie fallback stops finding it on a
  // same-origin deploy. That fallback was already dead on this one (the SPA
  // is a different host), and the token travels in the login/refresh
  // response body regardless, which is what the SPA actually uses.
  const legacyOptions = { ...baseCookieOptions(), path: '/' }
  // A session that predates this change holds a `csrf_token` at `/` as
  // well. Two cookies of the same name would be sent together and the
  // server would compare the header against whichever one came first —
  // a coin-flip 403, i.e. a random logout. Clearing the old one first
  // makes the switch a non-event.
  res.clearCookie(CSRF_COOKIE, legacyOptions)
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...baseCookieOptions(),
    httpOnly: false,
    path: REFRESH_COOKIE_PATH,
    maxAge: ms(env.JWT_REFRESH_TTL),
  })

  return csrfToken
}

export function clearAuthCookies(res) {
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH })
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH })
  // And the pre-9.3 one at the origin root, so a logout leaves nothing
  // behind for the next person on a shared machine.
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions(), path: '/' })
}

export function getRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE]
}
