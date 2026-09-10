import { FACE_GATE_ACTIONS, PERMISSIONS } from '@lms/shared'
import { materialRepository } from '../../repositories/material.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { computeAccessFlags } from '../courses/courseAssignmentAccess.js'
import { faceGateService } from '../face/faceGate.service.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'
import { canManageCourses } from '../courses/coursePermissions.js'

const materialsStorage = new S3StorageProvider(env.S3_BUCKET_MATERIALS)

// Mirrors videoAccess.service.js's issueToken authorization. Reading a file
// in the in-app viewer and downloading it are the same amount of access, so
// both entry points below go through this one check.
async function assertReadable(actor, materialId) {
  const material = await materialRepository.findById(materialId)
  if (!material) throw ApiError.notFound('Material not found')

  // A draft is invisible to learners, but the person who uploaded it has to
  // be able to open it — checking the file is exactly how they decide whether
  // to publish it.
  if (material.status !== 'PUBLISHED' && !canManageCourses(actor)) {
    throw ApiError.conflict('Material is not available for download yet', 'MATERIAL_NOT_AVAILABLE')
  }

  if (!canManageCourses(actor)) {
    const assignment = await courseAssignmentRepository.findByUserAndCourse(actor.id, material.courseId)
    const accessible = assignment ? computeAccessFlags(assignment).accessible : false
    if (!accessible) {
      throw ApiError.forbidden('You do not have access to this course', 'COURSE_ACCESS_DENIED')
    }
    // A presentation read in the viewer is the same lesson a video is, so it
    // is behind the same identity check — both call sites below come through
    // here, and neither hands over a byte before it passes.
    await faceGateService.assertVerified(actor, FACE_GATE_ACTIONS.MATERIAL)
  }

  return material
}

function displayFilename(material) {
  return material.originalFilename || material.key.split('/').pop()
}

export const materialAccessService = {
  // A presigned S3 URL — no byte-proxying needed for a whole file, unlike the
  // HLS segment machinery. `disposition: 'inline'` is what the viewer asks for
  // when the browser can render the file itself (PDF in a frame, audio in a
  // player); 'attachment' is the download button.
  async getDownloadUrl(actor, materialId, disposition = 'attachment') {
    const material = await assertReadable(actor, materialId)

    // AT-33. `attachment` is the download button; refusing it is the whole
    // control. `inline` is still issued, because the in-app viewer needs a
    // URL the browser can play audio from — and because the flag was never
    // DRM: it removes the download button, it does not stop somebody who
    // can read a file from keeping it.
    //
    // Staff are exempt: whoever uploaded the file has to be able to fetch
    // it back, and they are the person who set the flag.
    if (disposition === 'attachment' && material.allowDownload === false && !canManageCourses(actor)) {
      throw ApiError.forbidden(
        'This material can be read but not downloaded',
        'DOWNLOAD_NOT_ALLOWED'
      )
    }

    const filename = displayFilename(material)
    const url = await materialsStorage.getSignedUrl(material.key, env.MATERIAL_DOWNLOAD_URL_TTL, filename, {
      disposition,
      contentType: material.mimeType,
    })

    return {
      url,
      expiresIn: env.MATERIAL_DOWNLOAD_URL_TTL,
      disposition,
      mimeType: material.mimeType,
      filename,
    }
  },

  // Office formats have to be parsed in the browser to be rendered, and a
  // parser needs the raw bytes — which means an XHR, which means CORS on the
  // storage bucket. Streaming those bytes back through the API instead keeps
  // the viewer working on any storage backend, using the CORS rules the API
  // already has for the app origins. Big files stay on the presigned-URL path
  // above; only the formats we actually parse come through here.
  async openStream(actor, materialId) {
    const material = await assertReadable(actor, materialId)
    const body = await materialsStorage.getObject(material.key)
    return {
      body,
      mimeType: material.mimeType,
      filename: displayFilename(material),
      fileSize: material.fileSize,
    }
  },
}
