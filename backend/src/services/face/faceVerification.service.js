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
  if (file.buffer.length > MAX_BYTES) {
    throw ApiError.badRequest('Photo is too large', 'FILE_TOO_LARGE', { limit: MAX_BYTES / (1024 * 1024) })
  }
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
    throw ApiError.badRequest(`At most ${MAX_ENROLLMENT_FRAMES} photos are allowed`, 'TOO_MANY_FILES', {
      max: MAX_ENROLLMENT_FRAMES,
    })
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

async function enrollInternal(
  actor,
  targetUserId,
  files,
  { action, requireExisting, refuseIfEnrolled = false, countsAsVerification = false }
) {
  if (!targetUserId) throw ApiError.badRequest('userId is required', 'VALIDATION_ERROR')

  const targetUser = await userRepository.findById(targetUserId)
  if (!targetUser) throw ApiError.notFound('User not found')

  if (requireExisting) {
    const existing = await faceProfileRepository.findByUserId(targetUserId)
    if (!existing?.enrolled) {
      throw ApiError.notFound('User has no existing face enrollment to replace', 'FACE_PROFILE_NOT_ENROLLED')
    }
  }

  // The guard that keeps self-enrollment a first-run step and nothing more.
  // Replacing a face that is already on file stays with SUPERADMIN: if it
  // did not, anyone holding the password could answer a failed match by
  // simply enrolling their own face over the employee's.
  if (refuseIfEnrolled) {
    const existing = await faceProfileRepository.findByUserId(targetUserId)
    if (existing?.enrolled) {
      throw ApiError.conflict(
        'A reference photo is already on file for this account',
        'FACE_ALREADY_ENROLLED'
      )
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

  // The employee stood in front of the camera to produce these frames, so the
  // day's check is already answered — asking them to capture a second time,
  // seconds later, would be theatre.
  if (countsAsVerification) await faceProfileRepository.markVerified(targetUserId)

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
 * Who hears about something on an employee's face profile — same shape as
 * proctorSnapshot.service.js's notifyReviewers(): every active SUPERADMIN,
 * plus the employee's own department managers if they have one.
 */
async function notifyReviewers(userId, build) {
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

  const notification = build(learner)
  for (const recipientId of recipients) {
    await notificationService.notify({
      userId: recipientId,
      relatedEntityType: 'FaceProfile',
      relatedEntityId: userId,
      ...notification,
    })
  }
}

function notifyLockout(userId) {
  return notifyReviewers(userId, (learner) => ({
    type: 'FACE_VERIFICATION_LOCKED',
    title: `Face verification locked: ${learner?.fullName ?? 'an employee'}`,
    message: 'Repeated failed face verification attempts locked this account out temporarily.',
    severity: 'WARNING',
  }))
}

/**
 * Self-enrollment is trust-on-first-use: the reference face is whoever sat in
 * front of the camera holding this account's password. That is the trade the
 * product makes for not needing an admin present, and this notice is what
 * keeps it reviewable — the photo is on file and openable from the admin
 * panel, so a wrong face can be spotted and re-enrolled.
 */
function notifySelfEnrollment(userId) {
  return notifyReviewers(userId, (learner) => ({
    type: 'FACE_SELF_ENROLLMENT',
    title: `Face enrolled by the employee: ${learner?.fullName ?? 'an employee'}`,
    message: 'They captured their own reference photo on first use. Open their profile to review it.',
    severity: 'INFO',
  }))
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
   * The employee enrolling their own face, the way a banking app has you do
   * it: first time the app asks for a face and none is on file, the frames
   * they capture become the reference. Only ever the first time — see the
   * refuseIfEnrolled guard in enrollInternal.
   */
  async selfEnroll(actor, files) {
    const result = await enrollInternal(actor, actor.id, files, {
      action: 'FACE_SELF_ENROLLMENT',
      requireExisting: false,
      refuseIfEnrolled: true,
      countsAsVerification: true,
    })

    // Best-effort: an account is enrolled either way, and a failed notice is
    // not worth undoing that.
    try {
      await notifySelfEnrollment(actor.id)
    } catch (error) {
      logger.error('Self-enrollment notification failed', { error: error.message, userId: actor.id })
    }

    return result
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
