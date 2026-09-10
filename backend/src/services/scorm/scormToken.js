import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * The launch token: how a package's own requests prove who they are for.
 *
 * A SCORM package loads its assets itself, with relative URLs it wrote at
 * export time, and those requests carry no Authorization header — a browser
 * does not attach one to an image inside an iframe. Cookies would work in
 * production and not in local development (the SPA and the API are
 * different origins, so the cookie would have to be SameSite=None, which
 * requires Secure, which requires https). So the token travels in the URL
 * *path*: the player and every file sit under `/scorm/:id/f/:token/...`,
 * which means the package's own relative links resolve to a path that still
 * contains it. That is the whole trick, and it is why the token is a path
 * segment rather than a query parameter.
 *
 * Signed with VIDEO_TOKEN_SECRET rather than a secret of its own, with a
 * `scope` claim to keep the two apart. One less env var to forget on the
 * server — and env values not travelling with a deploy has already cost
 * this project a week (0.5).
 */
const SCOPE = 'scorm'

export function signLaunchToken(userId, packageId) {
  return jwt.sign({ sub: String(userId), pkg: String(packageId), scope: SCOPE }, env.VIDEO_TOKEN_SECRET, {
    expiresIn: env.SCORM_LAUNCH_TOKEN_TTL,
  })
}

/**
 * @returns {{userId: string, packageId: string}}
 * @throws 401 for anything wrong with the token, without saying which — a
 *   bad token means the gate applies, and the reason is not the caller's
 *   business.
 */
export function verifyLaunchToken(token, packageId) {
  let payload
  try {
    payload = jwt.verify(String(token ?? ''), env.VIDEO_TOKEN_SECRET)
  } catch {
    throw ApiError.unauthorized('Invalid or expired launch token', 'INVALID_LAUNCH_TOKEN')
  }
  // A video playback token is signed with the same key; without this check
  // it would open packages too.
  if (payload.scope !== SCOPE) {
    throw ApiError.unauthorized('Token is not a SCORM launch token', 'INVALID_LAUNCH_TOKEN')
  }
  if (packageId && payload.pkg !== String(packageId)) {
    throw ApiError.unauthorized('Launch token does not match this package', 'LAUNCH_TOKEN_MISMATCH')
  }
  return { userId: payload.sub, packageId: payload.pkg }
}
