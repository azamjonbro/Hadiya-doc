import { oidcAuthService } from '../services/integrations/oidcAuth.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { setAuthCookies } from '../utils/cookies.js'
import { requestMeta } from '../utils/requestMeta.js'
import { errorMessage } from '../utils/errorMessage.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

/**
 * The SSO endpoints (11.4).
 *
 * `callback` is the odd one: it is the only endpoint in this API whose
 * caller is a **browser following a redirect**, not the SPA's HTTP client.
 * So it answers with a redirect rather than the envelope — a JSON error
 * body would leave the person staring at raw JSON on the API domain with
 * no way back.
 */

/** `${APP_URL}/sso/callback?...`, or a plain page when APP_URL is unset. */
function spaUrl(path, params) {
  const query = new URLSearchParams(params).toString()
  // Configured, never built from the request: behind the Cloudflare tunnel
  // `X-Forwarded-Proto` says http on an https deployment, and redirecting
  // a freshly authenticated browser to http:// is how a session ends up
  // half-established over the wrong scheme.
  const base = env.APP_URL?.replace(/\/$/, '')
  return base ? `${base}${path}?${query}` : ''
}

export const ssoController = {
  status: asyncHandler(async (req, res) => {
    sendSuccess(res, await oidcAuthService.status())
  }),

  /**
   * Returns the provider URL rather than redirecting.
   *
   * The SPA starts this with `fetch`, and a 302 to another origin inside a
   * fetch is followed by the browser and lands as an opaque CORS failure.
   * Handing back the URL lets the SPA do the navigation itself, which is
   * what actually has to happen.
   */
  start: asyncHandler(async (req, res) => {
    const { url } = await oidcAuthService.start({ redirectPath: req.validatedQuery?.redirect ?? '' })
    sendSuccess(res, { url })
  }),

  callback: asyncHandler(async (req, res) => {
    const query = req.validatedQuery ?? req.query ?? {}

    // The provider reporting its own failure — the person cancelled at the
    // consent screen, most often. Not an error of ours, so it goes back to
    // the login page saying so rather than into our error handler.
    if (query.error) {
      const url = spaUrl('/sso/callback', { error: String(query.error).slice(0, 60) })
      if (url) return res.redirect(url)
      return res.status(400).type('text/plain').send(`Sign-in failed: ${query.error}`)
    }

    try {
      const { handoff, redirectPath } = await oidcAuthService.callback(
        { code: query.code, state: query.state },
        requestMeta(req)
      )
      // The handoff code travels in the URL, which is why it is
      // single-use and lives sixty seconds — see oidcAuth.service.js.
      const url = spaUrl('/sso/callback', { code: handoff, ...(redirectPath ? { next: redirectPath } : {}) })
      if (url) return res.redirect(url)
      // No APP_URL configured (a bare API deployment): the code is still
      // usable, so show it rather than losing a completed login.
      return res.type('text/plain').send(`Signed in. Exchange this code within a minute: ${handoff}`)
    } catch (error) {
      logger.warn('SSO callback failed', { error: errorMessage(error), code: error.code })
      const url = spaUrl('/sso/callback', { error: error.code ?? 'SSO_FAILED' })
      if (url) return res.redirect(url)
      throw error
    }
  }),

  /**
   * The SPA trades the handoff code for a session.
   *
   * Answers exactly like `POST /auth/login` — access token in the body,
   * refresh token in the httpOnly cookie, CSRF token alongside — so the
   * client has one code path for "we are now signed in".
   */
  exchange: asyncHandler(async (req, res) => {
    const result = await oidcAuthService.exchange(req.body.code, requestMeta(req))

    if (result.requiresFaceVerification) {
      sendSuccess(
        res,
        { requiresFaceVerification: true, verificationToken: result.verificationToken },
        'Face verification required'
      )
      return
    }

    const { accessToken, refreshToken, user } = result
    const csrfToken = setAuthCookies(res, { refreshToken })
    sendSuccess(res, { accessToken, user, csrfToken }, 'Logged in')
  }),
}
