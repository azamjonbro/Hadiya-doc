import jwt from 'jsonwebtoken'
import { PERMISSIONS } from '@lms/shared'
import { videoRepository } from '../../repositories/video.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { computeAccessFlags } from '../courses/courseAssignmentAccess.js'
import { assertVideoUnlocked } from '../courses/courseSequence.js'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'

function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

export const videoAccessService = {
  async issueToken(actor, videoId) {
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
    }

    // Lessons open one at a time. Checked here rather than only in the
    // sidebar, since without a playback token there is nothing to play —
    // typing the /videos/:id URL directly gets you the same refusal.
    await assertVideoUnlocked(actor, video)

    const token = jwt.sign({ sub: actor.id, videoId: video._id.toString() }, env.VIDEO_TOKEN_SECRET, {
      expiresIn: env.VIDEO_PLAYBACK_TOKEN_TTL,
    })

    return { token, expiresIn: env.VIDEO_PLAYBACK_TOKEN_TTL }
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
