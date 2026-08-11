import { PERMISSIONS } from '@lms/shared'
import { videoRepository } from '../../repositories/video.repository.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'

const originalsStorage = new S3StorageProvider(env.S3_BUCKET_ORIGINALS)

function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

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
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  }
}

export const videoService = {
  async listByTopic(actor, topicId) {
    const topic = await topicRepository.findById(topicId)
    if (!topic) throw ApiError.notFound('Topic not found')
    const canManage = canManageCourses(actor)
    if (topic.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Topic not found')

    const rows = await videoRepository.listByTopic(topicId)
    const visible = canManage ? rows : rows.filter((v) => v.status === 'PUBLISHED')
    return visible.map(toPublicVideo)
  },

  async getById(actor, id) {
    const video = await videoRepository.findById(id)
    if (!video) throw ApiError.notFound('Video not found')
    if (video.status !== 'PUBLISHED' && !canManageCourses(actor)) {
      throw ApiError.notFound('Video not found')
    }
    return toPublicVideo(video)
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
    return toPublicVideo(updated)
  },

  async remove(actor, id) {
    const existing = await videoRepository.findById(id)
    if (!existing) throw ApiError.notFound('Video not found')
    if (existing.originalKey) {
      await originalsStorage.deleteObject(existing.originalKey).catch(() => {})
      // @tus/s3-store keeps a companion `${key}.info` object with upload
      // bookkeeping metadata — clean it up alongside the video file.
      await originalsStorage.deleteObject(`${existing.originalKey}.info`).catch(() => {})
    }
    await videoRepository.deleteById(id)
    await auditLogRepository.record({ actor: actor.id, action: 'VIDEO_DELETED', entity: 'Video', entityId: id })
  },
}
