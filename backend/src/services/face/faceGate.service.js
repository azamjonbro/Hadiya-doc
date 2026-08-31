import { FACE_GATE_ACTIONS } from '@lms/shared'
import { faceProfileRepository } from '../../repositories/faceProfile.repository.js'
import { facePolicyService } from './facePolicy.service.js'
import { verifiedRecentlyEnough } from './faceCadence.js'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'

/**
 * The one place that answers "has this employee proved who they are recently
 * enough to open this?". Called from every entry point that hands over course
 * content — a playback token, a material's bytes, a test's questions — so the
 * three cannot drift apart, and so adding a fourth is one line.
 *
 * Nothing here is ever trusted from the client: each of those endpoints calls
 * this before it produces anything, and a browser that skips the check simply
 * receives the 403 again.
 */

// English fallbacks; the SPAs translate the `code` (front/src/utils/apiError.js).
const MESSAGES = {
  [FACE_GATE_ACTIONS.VIDEO]: 'Face verification is required before playback',
  [FACE_GATE_ACTIONS.MATERIAL]: 'Face verification is required before opening this material',
  [FACE_GATE_ACTIONS.ASSESSMENT]: 'Face verification is required before starting this test',
}

export const faceGateService = {
  /**
   * Throws 403 FACE_ENROLLMENT_REQUIRED (no reference photo on file yet) or
   * 403 FACE_VERIFICATION_REQUIRED (has one, needs to match it now). Two
   * codes rather than one because the client acts on both differently — a
   * single code is what once left an unenrolled employee staring at a
   * verification step that could only ever fail.
   *
   * Returns silently when the feature is off, which is the default: the same
   * rollout gates as the login check in auth.service.js.
   */
  async assertVerified(actor, action = FACE_GATE_ACTIONS.VIDEO) {
    if (!env.FACE_VERIFICATION_ENABLED || !env.FACE_VERIFICATION_REQUIRED) return

    const profile = await faceProfileRepository.findByUserId(actor.id)
    const enrolled = Boolean(profile?.enrolled && profile?.enabled)
    // Unenrolled users are left alone unless an operator opts in — flipping
    // that on rollout day one would lock out every employee nobody has
    // enrolled yet.
    if (!enrolled && !env.FACE_VERIFICATION_ENFORCE_UNENROLLED) return

    if (!enrolled) {
      throw ApiError.forbidden(
        'Face enrollment is required before this can be opened',
        'FACE_ENROLLMENT_REQUIRED',
        { action }
      )
    }

    const policy = await facePolicyService.getEffective()
    if (!verifiedRecentlyEnough(profile, policy)) {
      throw ApiError.forbidden(MESSAGES[action] ?? MESSAGES[FACE_GATE_ACTIONS.VIDEO], 'FACE_VERIFICATION_REQUIRED', {
        action,
        verifyEveryOpen: policy.verifyEveryOpen,
      })
    }
  },
}
