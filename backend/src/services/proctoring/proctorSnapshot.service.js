import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { ATTENTION_EVENTS, ATTENTION_REASONS, PERMISSIONS, ROLES } from '@lms/shared'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { ProctorSnapshot } from '../../models/proctorSnapshot.model.js'
import { videoRepository } from '../../repositories/video.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { videoAnalyticsEventRepository } from '../../repositories/videoAnalyticsEvent.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { attentionPolicyService } from '../courses/attentionPolicy.service.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

const proctorStorage = new S3StorageProvider(env.S3_BUCKET_PROCTOR)

// Magic-byte allowlist rather than the declared Content-Type, same rule as
// every other upload path here. The player only ever sends JPEG.
const ALLOWED_MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const VALID_REASONS = new Set([ATTENTION_REASONS.MULTIPLE_FACES, ATTENTION_REASONS.UNKNOWN_FACE])

// A frame at 320x240 is well under this; the ceiling is here so a tampered
// client cannot use the endpoint as free storage.
const MAX_BYTES = 512 * 1024

export const proctorSnapshotService = {
  /**
   * Called by the player when it sees a face that should not be there.
   *
   * The learner uploads a picture of themselves being watched, which is an
   * odd shape for an endpoint, so it is narrow on purpose: the video must
   * exist, the course must actually have capture switched on, and the reason
   * has to be one the client is allowed to claim. Everything else about the
   * record — who, when, which session — is taken from the token and the
   * server clock, never from the request body.
   */
  async capture(actor, videoId, { file, reason, sessionId, position, faceCount }) {
    if (!file) throw ApiError.badRequest('No snapshot uploaded', 'FILE_REQUIRED')
    if (file.buffer.length > MAX_BYTES) {
      throw ApiError.badRequest('Snapshot is too large', 'SNAPSHOT_TOO_LARGE')
    }
    if (!VALID_REASONS.has(reason)) {
      throw ApiError.badRequest('Unsupported snapshot reason', 'UNSUPPORTED_REASON')
    }

    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')

    // Capture is a per-course decision. Without this check a modified client
    // could file snapshots against a course whose admin never turned it on.
    const policy = await attentionPolicyService.getEffectiveForCourse(video.courseId)
    if (!policy?.enabled || !policy?.captureOnForeignFace) {
      throw ApiError.forbidden('Snapshot capture is not enabled for this course', 'CAPTURE_NOT_ENABLED')
    }

    const detected = await fileTypeFromBuffer(file.buffer)
    const ext = detected && ALLOWED_MIME_TO_EXT[detected.mime]
    if (!ext) throw ApiError.badRequest('Snapshot is not a supported image', 'UNSUPPORTED_IMAGE_TYPE')

    // Server-generated key, never anything the client sent.
    const key = `${actor.id}/${videoId}/${crypto.randomUUID()}.${ext}`
    await proctorStorage.putObject(key, file.buffer, detected.mime)

    const snapshot = await ProctorSnapshot.create({
      userId: actor.id,
      videoId,
      courseId: video.courseId ?? null,
      sessionId,
      reason,
      faceCount: faceCount ?? null,
      key,
      contentType: detected.mime,
      position: position ?? null,
    })

    // Lands on the same timeline as the attention events, so a reviewer sees
    // the alert in the context of what the learner was doing around it.
    await videoAnalyticsEventRepository.insertMany([
      {
        userId: actor.id,
        sessionId,
        videoId,
        eventType: ATTENTION_EVENTS.FOREIGN_FACE,
        timestamp: new Date(),
        position: position ?? null,
        metadata: { reason, faceCount: faceCount ?? null, snapshotId: snapshot._id.toString() },
      },
    ])

    await auditLogRepository.record({
      actor: actor.id,
      action: 'PROCTOR_SNAPSHOT_CAPTURED',
      entity: 'ProctorSnapshot',
      entityId: snapshot._id.toString(),
      metadata: { videoId, reason },
    })

    // Best-effort: an alert that fails to send must not fail the upload, or
    // the evidence is lost along with the notification.
    try {
      await notifyReviewers(actor, video, snapshot)
    } catch (error) {
      logger.error('Proctor snapshot notification failed', { error: error.message, snapshotId: snapshot._id.toString() })
    }

    return { id: snapshot._id.toString(), reason, capturedAt: snapshot.createdAt }
  },

  /** Admin-side listing. Never returns the object key or any direct URL. */
  async list(actor, { videoId, userId, page = 1, limit = 20 }) {
    const filter = {}
    if (videoId) filter.videoId = videoId
    if (userId) filter.userId = userId

    const [rows, total] = await Promise.all([
      ProctorSnapshot.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'fullName email branch department')
        .populate('videoId', 'title'),
      ProctorSnapshot.countDocuments(filter),
    ])

    return {
      items: rows.map(toPublicSnapshot),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  },

  /**
   * Streams the image itself. The bucket is private and there is no signed
   * URL anywhere: every view goes through this method, so every view is a
   * request that had to carry an admin's token.
   */
  async image(actor, id) {
    const snapshot = await ProctorSnapshot.findById(id)
    if (!snapshot) throw ApiError.notFound('Snapshot not found')

    const body = await proctorStorage.getObject(snapshot.key)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'PROCTOR_SNAPSHOT_VIEWED',
      entity: 'ProctorSnapshot',
      entityId: id,
    })

    return { body, contentType: snapshot.contentType }
  },

  async markReviewed(actor, id) {
    const snapshot = await ProctorSnapshot.findByIdAndUpdate(
      id,
      { reviewedAt: new Date(), reviewedBy: actor.id },
      { new: true }
    )
    if (!snapshot) throw ApiError.notFound('Snapshot not found')
    return toPublicSnapshot(snapshot)
  },
}

function toPublicSnapshot(s) {
  const user = s.userId && typeof s.userId === 'object' ? s.userId : null
  const video = s.videoId && typeof s.videoId === 'object' ? s.videoId : null
  return {
    id: s._id.toString(),
    reason: s.reason,
    faceCount: s.faceCount,
    position: s.position,
    capturedAt: s.createdAt,
    reviewedAt: s.reviewedAt,
    user: user ? { id: user._id.toString(), fullName: user.fullName, email: user.email ?? '', branch: user.branch ?? '' } : null,
    video: video ? { id: video._id.toString(), title: video.title } : null,
  }
}

/**
 * Who hears about it. The learner's own manager is the person who acts on
 * this, but a proctoring alert is also an integrity matter, so SUPERADMINs
 * are told as well. Deliberately not every ADMIN: a wide broadcast of
 * "here is a photo of an employee" is its own problem.
 */
async function notifyReviewers(actor, video, snapshot) {
  const learner = await userRepository.findById(actor.id)
  const recipients = new Set()

  const superAdmins = await userRepository.listActiveByRolesAndDepartment({ roleNames: [ROLES.SUPERADMIN] })
  for (const u of superAdmins) recipients.add(u._id.toString())

  if (learner?.department) {
    const managers = await userRepository.listActiveByRolesAndDepartment({
      roleNames: [ROLES.MANAGER],
      department: learner.department,
    })
    for (const u of managers) recipients.add(u._id.toString())
  }
  recipients.delete(actor.id)

  const reasonText =
    snapshot.reason === ATTENTION_REASONS.MULTIPLE_FACES
      ? 'another person appeared on camera'
      : 'the face on camera did not match the account'

  for (const userId of recipients) {
    await notificationService.notify({
      userId,
      type: ATTENTION_EVENTS.FOREIGN_FACE,
      title: `Proctoring alert: ${learner?.fullName ?? 'a learner'}`,
      message: `While watching "${video.title}", ${reasonText}.`,
      relatedEntityType: 'ProctorSnapshot',
      relatedEntityId: snapshot._id.toString(),
      severity: 'WARNING',
    })
  }
}

export const PROCTOR_VIEW_PERMISSION = PERMISSIONS.ANALYTICS_VIEW_ALL
