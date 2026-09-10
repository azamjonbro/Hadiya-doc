import { env } from '../config/env.js'

/**
 * Frame and CSP headers for the two routes a SCORM package is served on.
 *
 * `helmet()` sets `X-Frame-Options: SAMEORIGIN` for the whole API, which is
 * right for every other response and fatal for these two: the SPA lives on
 * another host, so framing the player page would be refused by the browser.
 * The replacement is `frame-ancestors` with the origins we actually allow —
 * the modern, per-response version of the same control, and unlike
 * X-Frame-Options it takes a list.
 *
 * The rest of the policy is about what the *content* may do. A package is a
 * website an author uploaded, and it is served from the API's own origin
 * because SCORM requires the content and the runtime API to be same-origin
 * (see scormPlayerPage.js). That is a real trade-off, and it is narrowed
 * here rather than ignored:
 *
 *   - `frame-ancestors` — only our own app may frame it, so a package
 *     cannot be embedded on a third-party page to phish our learners.
 *   - `form-action 'none'` — a package has nothing to submit; this stops a
 *     login form drawn inside it from posting anywhere.
 *   - `base-uri 'none'` — no rewriting what its relative URLs resolve to.
 *   - `object-src 'none'` — no plugins.
 *
 * What is *not* restricted is script and media: an exported course is
 * JavaScript, inline handlers and all, and a policy that broke it would
 * simply mean nobody uses the feature.
 *
 * The residual risk is written down in the checklist entry for 9.3: content
 * on this origin can still talk to the API as any endpoint that needs no
 * token, and the proper fix is a separate host for package files, which
 * needs a DNS record this session cannot create. The credential path — the
 * CSRF cookie the refresh endpoint checks — was closed in cookies.js.
 */
export function scormFrameHeaders(req, res, next) {
  // `'self'` as well as the app origins, and not only for tidiness: the
  // package's own files are framed by the launcher page, which is on *this*
  // origin. Leaving it out blocks the inner frame — the browser refuses the
  // navigation and the launcher is left holding an empty iframe, which is
  // exactly how this was found.
  const ancestors = ["'self'", ...env.allowedOrigins].join(' ')

  res.removeHeader('X-Frame-Options')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
      "style-src 'self' 'unsafe-inline' data:",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${ancestors}`,
    ].join('; ')
  )
  // helmet's COEP/CORP defaults would refuse to let the SPA frame this at
  // all; the package is not cross-origin isolated and does not need to be.
  res.removeHeader('Cross-Origin-Embedder-Policy')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
}
