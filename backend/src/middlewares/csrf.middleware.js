import { ApiError } from '../utils/ApiError.js'

// Double-submit check for the one cookie-authenticated route (/auth/refresh):
// the cookie value must match a header the frontend can only send if it
// could read the (non-httpOnly) csrf cookie itself — a cross-site request
// can attach the cookie automatically but can't read it to set the header.
export function verifyCsrf(req, res, next) {
  const cookieToken = req.cookies?.csrf_token
  const headerToken = req.headers['x-csrf-token']

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(ApiError.forbidden('Invalid or missing CSRF token', 'CSRF_VALIDATION_FAILED'))
    return
  }
  next()
}
