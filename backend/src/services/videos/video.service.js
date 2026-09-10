import { Video } from '../../models/video.model.js'
import { videoRepository } from '../../repositories/video.repository.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { openTopic, visibleRows } from '../courses/contentItem.js'
import { ApiError } from '../../utils/ApiError.js'
import { courseCompletionService } from '../courses/courseCompletion.service.js'
import { logger } from '../../config/logger.js'
import { canManageCourses } from '../courses/coursePermissions.js'
import { subtitleService } from './subtitle.service.js'

const originalsStorage = new S3StorageProvider(env.S3_BUCKET_ORIGINALS)

function toPublicVideo(video) {
  return {
    id: video._id.toString(),
    topicId: video.topicId.toString(),
    courseId: video.courseId.toString(),
    title: video.title,
    description: video.description,
    posterUrl: video.posterUrl,
    thumbnailUrl: video.thumbnailUrl,
    duration: video.duration,
    fileSize: video.fileSize,
    qualities: video.qualities,
    processingStatus: video.processingStatus,
    processingError: video.processingError,
    status: video.status,
    required: video.required,
    order: video.order,
    hasQuiz: video.hasQuiz,
    pointsEnabled: video.pointsEnabled,
    points: video.points,
    // Caption tracks (9.4). Sent with the video rather than fetched
    // separately: the player needs them in the same render that builds the
    // <track> elements, and a second request would show the video without
    // captions for a moment on every open.
    subtitles: (video.subtitles ?? []).map((track) => ({
      id: track._id.toString(),
      lang: track.lang,
      label: track.label || track.lang,
      source: track.source,
      isDefault: track.isDefault,
      cueCount: track.cueCount,
    })),
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  }
}

export const videoService = {
  async listByTopic(actor, topicId) {
    const { canManage } = await openTopic(actor, topicId)
    return visibleRows(await videoRepository.listByTopic(topicId), canManage).map(toPublicVideo)
  },

  async getById(actor, id) {
    const video = await videoRepository.findById(id)
    if (!video) throw ApiError.notFound('Video not found')
    if (video.status !== 'PUBLISHED' && !canManageCourses(actor)) {
      throw ApiError.notFound('Video not found')
    }
    return toPublicVideo(video)
  },

  /** The tracks, behind the same visibility gate as the video itself. */
  async listSubtitles(actor, id) {
    const video = await videoRepository.findById(id)
    if (!video) throw ApiError.notFound('Video not found')
    if (video.status !== 'PUBLISHED' && !canManageCourses(actor)) throw ApiError.notFound('Video not found')
    return subtitleService.list(video)
  },

  async getStatus(actor, id) {
    const video = await videoRepository.findById(id)
    if (!video) throw ApiError.notFound('Video not found')
    if (video.status !== 'PUBLISHED' && !canManageCourses(actor)) {
      throw ApiError.notFound('Video not found')
    }
    return {
      id: video._id.toString(),
      processingStatus: video.processingStatus,
      processingError: video.processingError,
    }
  },

  async update(actor, id, payload) {
    const existing = await videoRepository.findById(id)
    if (!existing) throw ApiError.notFound('Video not found')
    const updated = await videoRepository.updateById(id, { ...payload, updatedBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'VIDEO_UPDATED',
      entity: 'Video',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })

    // AT-04: publishing a lesson into a course changes what "finished" means
    // for everyone already on it, and none of them is making a request at
    // that moment. Only on the transition into PUBLISHED, and only when the
    // requirement could actually have changed — re-titling a video must not
    // walk every learner.
    const nowPublished = existing.status !== 'PUBLISHED' && updated.status === 'PUBLISHED'
    const requirementChanged = payload.required !== undefined && payload.required !== existing.required
    if (nowPublished || requirementChanged) {
      await courseCompletionService.evaluateCourse(updated.courseId).catch((error) => {
        logger.warn('Re-evaluating completion after a video change failed', {
          videoId: id,
          error: error.message,
        })
      })
    }

    return toPublicVideo(updated)
  },

  async remove(actor, id) {
    const existing = await videoRepository.findById(id)
    if (!existing) throw ApiError.notFound('Video not found')
    if (existing.originalKey) {
      // Duplicating a course copies the video rows but references the same
      // stored file (courseDuplicate.service.js) — gigabytes are not
      // re-uploaded to make an editable copy of a syllabus. So the object
      // is only dropped once nothing else points at it; without this check,
      // deleting a lesson from one copy would empty the player in the other.
      const sharedWith = await Video.countDocuments({
        _id: { $ne: existing._id },
        originalKey: existing.originalKey,
      })
      if (sharedWith === 0) {
        await originalsStorage.deleteObject(existing.originalKey).catch(() => {})
        // @tus/s3-store keeps a companion `${key}.info` object with upload
        // bookkeeping metadata — clean it up alongside the video file.
        await originalsStorage.deleteObject(`${existing.originalKey}.info`).catch(() => {})
      }
    }
    await videoRepository.deleteById(id)
    await auditLogRepository.record({ actor: actor.id, action: 'VIDEO_DELETED', entity: 'Video', entityId: id })
  },
}
