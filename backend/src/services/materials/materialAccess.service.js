import { PERMISSIONS } from '@lms/shared'
import { materialRepository } from '../../repositories/material.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { computeAccessFlags } from '../courses/courseAssignmentAccess.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'

const materialsStorage = new S3StorageProvider(env.S3_BUCKET_MATERIALS)

function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

// Mirrors videoAccess.service.js's issueToken authorization, but a whole
// downloadable file needs only a single presigned S3 URL — not the
// JWT-per-segment + byte-proxying machinery HLS streaming requires.
export const materialAccessService = {
  async getDownloadUrl(actor, materialId) {
    const material = await materialRepository.findById(materialId)
    if (!material) throw ApiError.notFound('Material not found')

    if (material.status !== 'PUBLISHED') {
      throw ApiError.conflict('Material is not available for download yet', 'MATERIAL_NOT_AVAILABLE')
    }

    if (!canManageCourses(actor)) {
      const assignment = await courseAssignmentRepository.findByUserAndCourse(actor.id, material.courseId)
      const accessible = assignment ? computeAccessFlags(assignment).accessible : false
      if (!accessible) {
        throw ApiError.forbidden('You do not have access to this course', 'COURSE_ACCESS_DENIED')
      }
    }

    const filename = material.originalFilename || material.key.split('/').pop()
    const url = await materialsStorage.getSignedUrl(material.key, env.MATERIAL_DOWNLOAD_URL_TTL, filename)

    return { url, expiresIn: env.MATERIAL_DOWNLOAD_URL_TTL }
  },
}
