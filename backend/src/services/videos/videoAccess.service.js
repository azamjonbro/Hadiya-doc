import jwt from 'jsonwebtoken'
import { FACE_GATE_ACTIONS, PERMISSIONS } from '@lms/shared'
import { videoRepository } from '../../repositories/video.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { computeAccessFlags } from '../courses/courseAssignmentAccess.js'
import { assertVideoUnlocked } from '../courses/courseSequence.js'
import { assertPathItemUnlocked } from '../paths/pathSequence.js'
import { faceGateService } from '../face/faceGate.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'

function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

export const videoAccessService = {
  /**
   * `renewToken` is the caller's current, still-valid playback token, sent by
   * the player's two-minute refresh loop. It exempts the renewal from the
   * face gate and nothing else: holding one is proof the gate was already
   * passed for this video, since a first token cannot be obtained any other
   * way. Without this, a policy of "check before every video" would stop a
   * lesson halfway through — the refresh would 403 and the stream would die
   * when the token in flight expired.
   */
  async issueToken(actor, videoId, { renewToken = '' } = {}) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')

    if (video.status !== 'PUBLISHED' || video.processingStatus !== 'READY') {
      throw ApiError.conflict('Video is not available for playback yet', 'VIDEO_NOT_READY')
    }

    if (!canManageCourses(actor)) {
      const assignment = await courseAssignmentRepository.findByUserAndCourse(actor.id, video.courseId)
      const accessible = assignment ? computeAccessFlags(assignment).accessible : false
      if (!accessible) {
        throw ApiError.forbidden('You do not have access to this course', 'COURSE_ACCESS_DENIED')
      }
      if (!this.isRenewal(actor, renewToken, video._id.toString())) {
        await faceGateService.assertVerified(actor, FACE_GATE_ACTIONS.VIDEO)
      }
    }

    // Two locks, both checked here rather than only in the sidebar, since
    // without a playback token there is nothing to play — typing the
    // /videos/:id URL directly gets the same refusal.
    //
    // The path one first: being told "finish the previous course" is a more
    // useful answer than "finish the previous lesson" of a course you are
    // not supposed to have opened yet (AT-26).
    await assertPathItemUnlocked(actor, video.courseId)
    await assertVideoUnlocked(actor, video)

    const token = jwt.sign({ sub: actor.id, videoId: video._id.toString() }, env.VIDEO_TOKEN_SECRET, {
      expiresIn: env.VIDEO_PLAYBACK_TOKEN_TTL,
    })

    return { token, expiresIn: env.VIDEO_PLAYBACK_TOKEN_TTL }
  },

  // Deliberately silent about *why* a renewal token was rejected: a bad one
  // simply means the gate is applied, which is the safe answer either way.
  isRenewal(actor, token, videoId) {
    if (!token) return false
    try {
      const payload = this.verifyToken(token, videoId)
      return payload.sub === actor.id
    } catch {
      return false
    }
  },

  verifyToken(token, videoId) {
    let payload
    try {
      payload = jwt.verify(token, env.VIDEO_TOKEN_SECRET)
    } catch {
      throw ApiError.unauthorized('Invalid or expired playback token', 'INVALID_PLAYBACK_TOKEN')
    }
    if (payload.videoId !== videoId) {
      throw ApiError.unauthorized('Playback token does not match this video', 'PLAYBACK_TOKEN_MISMATCH')
    }
    return payload
  },
}
