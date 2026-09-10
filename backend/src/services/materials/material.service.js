import { PERMISSIONS } from '@lms/shared'
import { Material } from '../../models/material.model.js'
import { materialRepository } from '../../repositories/material.repository.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { materialUploadService } from '../uploads/materialUpload.service.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { openTopic, visibleRows } from '../courses/contentItem.js'
import { ApiError } from '../../utils/ApiError.js'

const materialsStorage = new S3StorageProvider(env.S3_BUCKET_MATERIALS)

function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

function toPublicMaterial(material) {
  return {
    id: material._id.toString(),
    topicId: material.topicId.toString(),
    courseId: material.courseId.toString(),
    type: material.type,
    title: material.title,
    description: material.description,
    originalFilename: material.originalFilename,
    mimeType: material.mimeType,
    fileSize: material.fileSize,
    status: material.status,
    order: material.order,
    // Defaulted rather than left undefined: materials uploaded before 7.5
    // have no such field, and a viewer reading `undefined` would hide the
    // download button on every one of them.
    allowDownload: material.allowDownload !== false,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
  }
}

export const materialService = {
  async listByTopic(actor, topicId) {
    const { canManage } = await openTopic(actor, topicId)
    return visibleRows(await materialRepository.listByTopic(topicId), canManage).map(toPublicMaterial)
  },

  async getById(actor, id) {
    const material = await materialRepository.findById(id)
    if (!material) throw ApiError.notFound('Material not found')
    if (material.status !== 'PUBLISHED' && !canManageCourses(actor)) {
      throw ApiError.notFound('Material not found')
    }
    return toPublicMaterial(material)
  },

  async create(actor, topicId, meta, file) {
    const topic = await topicRepository.findById(topicId)
    if (!topic) throw ApiError.notFound('Topic not found')

    const uploaded = await materialUploadService.upload(actor, meta.type, file)

    const material = await materialRepository.create({
      topicId,
      courseId: topic.courseId,
      type: meta.type,
      title: meta.title,
      description: meta.description ?? '',
      order: meta.order ?? 0,
      // Absent means the default (downloadable). Only an explicit false
      // restricts it — a missing checkbox must not lock a document.
      allowDownload: meta.allowDownload !== false,
      key: uploaded.key,
      mimeType: uploaded.mimeType,
      fileSize: uploaded.fileSize,
      originalFilename: uploaded.originalFilename,
      createdBy: actor.id,
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'MATERIAL_CREATED',
      entity: 'Material',
      entityId: material._id.toString(),
    })
    return toPublicMaterial(material)
  },

  async update(actor, id, payload) {
    const existing = await materialRepository.findById(id)
    if (!existing) throw ApiError.notFound('Material not found')
    const updated = await materialRepository.updateById(id, { ...payload, updatedBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'MATERIAL_UPDATED',
      entity: 'Material',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicMaterial(updated)
  },

  async remove(actor, id) {
    const existing = await materialRepository.findById(id)
    if (!existing) throw ApiError.notFound('Material not found')
    if (existing.key) {
      // Same reasoning as video.service.js: a duplicated course shares the
      // stored file rather than copying it, so the object only goes when the
      // last row referencing it does.
      const sharedWith = await Material.countDocuments({ _id: { $ne: existing._id }, key: existing.key })
      if (sharedWith === 0) await materialsStorage.deleteObject(existing.key).catch(() => {})
    }
    await materialRepository.deleteById(id)
    await auditLogRepository.record({ actor: actor.id, action: 'MATERIAL_DELETED', entity: 'Material', entityId: id })
  },
}
