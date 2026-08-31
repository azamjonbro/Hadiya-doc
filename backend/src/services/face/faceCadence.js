// Its own module rather than a private function in faceGate.service.js: this
// is the rule the whole setting turns on, and keeping it clear of the
// repository and cache imports is what lets test/facePolicy.test.js check it
// without a Mongo and a Redis to talk to.
import { isSameLocalDay } from '../../utils/timezone.js'
import { env } from '../../config/env.js'

/**
 * Was the last check recent enough?
 *
 * In per-open mode this is a freshness window rather than a single-use token.
 * A window is what the stored `lastVerifiedAt` can actually express, and it
 * costs an employee one check per resource in practice: opening a second
 * lesson happens minutes after the first, not seconds. The tradeoff it
 * accepts on purpose is that a material opened immediately after a video —
 * inside the same window — reuses that check instead of asking twice in a row.
 */
export function verifiedRecentlyEnough(profile, { verifyEveryOpen }) {
  if (!profile?.lastVerifiedAt) return false
  if (!verifyEveryOpen) return isSameLocalDay(profile.lastVerifiedAt, new Date(), env.APP_TIMEZONE)
  return Date.now() - profile.lastVerifiedAt.getTime() < env.FACE_VERIFICATION_FRESH_SECONDS * 1000
}
