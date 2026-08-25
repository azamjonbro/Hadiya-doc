import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { ROLES } from '@lms/shared'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { faceProfileRepository } from '../../repositories/faceProfile.repository.js'
import { faceVerificationChallengeRepository } from '../../repositories/faceVerificationChallenge.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { faceEmbeddingService, FACE_MODEL_VERSION } from './faceEmbedding.service.js'
import { issueSession, toPublicUser } from '../auth/auth.service.js'
import { generateAccessToken } from '../../utils/tokens.js'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'

const faceStorage = new S3StorageProvider(env.S3_BUCKET_FACES)

// Magic-byte allowlist, not the declared Content-Type — same rule as every
// other upload path in this backend (proctorSnapshot.service.js,
// imageUpload.service.js).
const ALLOWED_MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const MAX_BYTES = 3 * 1024 * 1024
const MAX_ENROLLMENT_FRAMES = 3

async function readFrame(file) {
  if (file.buffer.length > MAX_BYTES) throw ApiError.badRequest('Photo is too large', 'FILE_TOO_LARGE')
  const detected = await fileTypeFromBuffer(file.buffer)
  const ext = detected && ALLOWED_MIME_TO_EXT[detected.mime]
  if (!ext) throw ApiError.badRequest('Photo is not a supported image', 'UNSUPPORTED_IMAGE_TYPE')
  return { buffer: file.buffer, mime: detected.mime, ext }
}

// Detects a face in every submitted frame and averages their descriptors —
// noticeably more robust than keeping just one frame. The first frame that
// passes detection is kept as the reference photo for admin review.
async function processEnrollmentFrames(files) {
  if (!files?.length) throw ApiError.badRequest('At least one face photo is required', 'FILE_REQUIRED')
  if (files.length > MAX_ENROLLMENT_FRAMES) {
    throw ApiError.badRequest(`At most ${MAX_ENROLLMENT_FRAMES} photos are allowed`, 'TOO_MANY_FILES')
  }

  const descriptors = []
  let referenceFrame = null

  for (const file of files) {
    const frame = await readFrame(file)
    const result = await faceEmbeddingService.detectAndDescribe(frame.buffer)
    if (!result.ok) {
      throw ApiError.badRequest(
        'Could not read a single, clear face from one of the photos',
        'ENROLLMENT_FRAME_REJECTED'
      )
    }
    descriptors.push(result.descriptor)
    if (!referenceFrame) referenceFrame = frame
  }

  return { embedding: faceEmbeddingService.averageDescriptors(descriptors), referenceFrame }
}

async function enrollInternal(actor, targetUserId, files, { action, requireExisting }) {
  if (!targetUserId) throw ApiError.badRequest('userId is required', 'VALIDATION_ERROR')

  const targetUser = await userRepository.findById(targetUserId)
  if (!targetUser) throw ApiError.notFound('User not found')

  if (requireExisting) {
    const existing = await faceProfileRepository.findByUserId(targetUserId)
    if (!existing?.enrolled) {
      throw ApiError.notFound('User has no existing face enrollment to replace', 'FACE_PROFILE_NOT_ENROLLED')
    }
  }

  let processed
  try {
    processed = await processEnrollmentFrames(files)
  } catch (error) {
    await auditLogRepository.record({
      actor: actor.id,
      action: 'FACE_ENROLLMENT_FAILED',
      entity: 'FaceProfile',
      entityId: targetUserId,
      metadata: { reason: error.code ?? 'UNKNOWN' },
    })
    throw error
  }

  const key = `${targetUserId}/${crypto.randomUUID()}.${processed.referenceFrame.ext}`
  await faceStorage.putObject(key, processed.referenceFrame.buffer, processed.referenceFrame.mime)

  await faceProfileRepository.upsertEnrollment(targetUserId, {
    embedding: processed.embedding,
    modelVersion: FACE_MODEL_VERSION,
    referenceImageKey: key,
    referenceImageContentType: processed.referenceFrame.mime,
    enrolledBy: actor.id,
  })

  await auditLogRepository.record({
    actor: actor.id,
    action,
    entity: 'FaceProfile',
    entityId: targetUserId,
    metadata: { frameCount: files.length },
  })

  return { enrolled: true }
}

async function failVerification(userId, reason) {
  const profile = await faceProfileRepository.registerFailedAttempt(userId, {
    maxAttempts: env.FACE_VERIFICATION_MAX_ATTEMPTS,
    lockMinutes: env.FACE_VERIFICATION_LOCK_MINUTES,
  })

  await auditLogRepository.record({
    actor: userId,
    action: 'FACE_VERIFICATION_FAILED',
    entity: 'FaceProfile',
    entityId: userId,
    metadata: { reason },
  })

  if (profile?.lockedUntil) {
    await auditLogRepository.record({
      actor: userId,
      action: 'FACE_VERIFICATION_LOCKED',
      entity: 'FaceProfile',
      entityId: userId,
    })
    try {
      await notifyLockout(userId)
    } catch (error) {
      logger.error('Face verification lockout notification failed', { error: error.message, userId })
    }
  }

  // Same generic message regardless of the internal reason (spec §20) — the
  // reason lives only in the audit metadata above.
  throw ApiError.unauthorized('Face verification failed', 'FACE_VERIFICATION_FAILED')
}

/**
 * Who hears about a lockout — same shape as proctorSnapshot.service.js's
 * notifyReviewers(): every active SUPERADMIN, plus the employee's own
 * department managers if they have one.
 */
async function notifyLockout(userId) {
  const learner = await userRepository.findById(userId)
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
  recipients.delete(userId)

  for (const recipientId of recipients) {
    await notificationService.notify({
      userId: recipientId,
      type: 'FACE_VERIFICATION_LOCKED',
      title: `Face verification locked: ${learner?.fullName ?? 'an employee'}`,
      message: 'Repeated failed face verification attempts locked this account out temporarily.',
      relatedEntityType: 'FaceProfile',
      relatedEntityId: userId,
      severity: 'WARNING',
    })
  }
}

export const faceVerificationService = {
  enroll(actor, targetUserId, files) {
    return enrollInternal(actor, targetUserId, files, {
      action: 'FACE_ENROLLMENT_SUCCESS',
      requireExisting: false,
    })
  },

  reEnroll(actor, targetUserId, files) {
    return enrollInternal(actor, targetUserId, files, {
      action: 'FACE_RE_ENROLLMENT',
      requireExisting: true,
    })
  },

  /**
   * faceContext is { userId, viaChallenge, challenge, meta } from
   * authenticateOrFaceChallenge. Both call sites — the login challenge and
   * the already-authenticated video-playback gate — run the same match
   * logic; only what happens after a PASS differs.
   */
  async verify(faceContext, file) {
    if (!file) throw ApiError.badRequest('No photo uploaded', 'FILE_REQUIRED')

    const { userId, viaChallenge, challenge, meta } = faceContext

    const profile = await faceProfileRepository.findByUserIdWithEmbedding(userId)
    if (!profile?.enrolled || !profile.enabled) {
      throw ApiError.forbidden('Face verification is not set up for this account', 'FACE_NOT_ENROLLED')
    }

    if (profile.lockedUntil && profile.lockedUntil > new Date()) {
      throw ApiError.tooManyRequests(
        'Face verification is temporarily locked due to repeated failed attempts',
        'FACE_VERIFICATION_LOCKED'
      )
    }

    const frame = await readFrame(file).catch(() => null)
    if (!frame) return failVerification(userId, 'UNSUPPORTED_IMAGE_TYPE')

    const detected = await faceEmbeddingService.detectAndDescribe(frame.buffer)
    if (!detected.ok) return failVerification(userId, detected.reason)

    const score = faceEmbeddingService.similarity(detected.descriptor, profile.embedding)
    if (score < env.FACE_MATCH_THRESHOLD) return failVerification(userId, 'FACE_MISMATCH')

    await faceProfileRepository.markVerified(userId)
    await auditLogRepository.record({
      actor: userId,
      action: 'FACE_VERIFICATION_SUCCESS',
      entity: 'FaceProfile',
      entityId: userId,
      metadata: { viaChallenge },
    })

    if (!viaChallenge) {
      return { viaChallenge: false, verified: true, lastVerifiedAt: new Date() }
    }

    await faceVerificationChallengeRepository.consume(challenge._id)

    const user = await userRepository.findById(userId)
    const role = await roleRepository.findById(user.roleId)
    const accessToken = generateAccessToken(user, role)
    const { refreshToken } = await issueSession(user, meta)

    return { viaChallenge: true, accessToken, refreshToken, user: toPublicUser(user, role) }
  },

  async status(userId) {
    const profile = await faceProfileRepository.findByUserId(userId)
    if (!profile) return { enabled: false, enrolled: false, enrolledAt: null, lastVerifiedAt: null }
    return {
      enabled: profile.enabled,
      enrolled: profile.enrolled,
      enrolledAt: profile.enrolledAt,
      lastVerifiedAt: profile.lastVerifiedAt,
    }
  },

  async setEnabled(actor, targetUserId, enabled) {
    const profile = await faceProfileRepository.setEnabled(targetUserId, enabled)
    if (!profile) throw ApiError.notFound('Face profile not found for this user', 'FACE_PROFILE_NOT_FOUND')

    await auditLogRepository.record({
      actor: actor.id,
      action: enabled ? 'FACE_VERIFICATION_ENABLED' : 'FACE_VERIFICATION_DISABLED',
      entity: 'FaceProfile',
      entityId: targetUserId,
    })

    return { enabled: profile.enabled }
  },

  /**
   * Streams the reference photo. The bucket is private with no signed URL
   * anywhere — same treatment as proctorSnapshot.service.js's image() — so
   * every view goes through here, and every view is audited.
   */
  async referenceImage(actor, targetUserId) {
    const profile = await faceProfileRepository.findByUserId(targetUserId)
    if (!profile?.referenceImageKey) throw ApiError.notFound('No reference photo on file for this user')

    const body = await faceStorage.getObject(profile.referenceImageKey)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'FACE_REFERENCE_IMAGE_VIEWED',
      entity: 'FaceProfile',
      entityId: targetUserId,
    })

    return { body, contentType: profile.referenceImageContentType ?? 'image/jpeg' }
  },
}
