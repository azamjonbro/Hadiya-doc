import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { sessionRepository } from '../../repositories/session.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { faceProfileRepository } from '../../repositories/faceProfile.repository.js'
import { faceVerificationChallengeRepository } from '../../repositories/faceVerificationChallenge.repository.js'
import { verifyPassword, hashPassword } from '../../utils/hash.js'
import {
  generateAccessToken,
  generateOpaqueToken,
  hashOpaqueToken,
  refreshTokenExpiryDate,
} from '../../utils/tokens.js'
import { verifyCaptcha } from './captcha.service.js'
import { isSameLocalDay } from '../../utils/timezone.js'
import { ApiError } from '../../utils/ApiError.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'

// Exported so faceVerification.service.js can complete a login the exact
// same way (mint access + refresh tokens) once the extra face check passes
// — one token-issuing path, not two.
export function toPublicUser(user, role) {
  return {
    id: user._id.toString(),
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    fullName: user.fullName,
    jshshir: user.jshshir,
    passportSeries: user.passportSeries ?? '',
    email: user.email ?? '',
    branch: user.branch ?? '',
    department: user.department,
    position: user.position,
    avatar: user.avatar,
    role: role.name,
    permissions: role.permissions,
  }
}

export async function issueSession(user, meta, replacesSessionId = null) {
  const refreshToken = generateOpaqueToken()
  const session = await sessionRepository.create({
    userId: user._id,
    refreshTokenHash: hashOpaqueToken(refreshToken),
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: refreshTokenExpiryDate(),
  })
  if (replacesSessionId) {
    await sessionRepository.markReplaced(replacesSessionId, session._id)
  }
  return { refreshToken, session }
}

// Returns a { requiresFaceVerification, verificationToken } payload if this
// login must stop here for a face check, or null to proceed to normal
// session issuance. FACE_VERIFICATION_ENABLED/REQUIRED off (the default)
// short-circuits immediately, so an upgraded deployment behaves exactly as
// before until an operator opts in.
async function issueFaceChallengeIfRequired(user) {
  if (!env.FACE_VERIFICATION_ENABLED || !env.FACE_VERIFICATION_REQUIRED) return null

  const profile = await faceProfileRepository.findByUserId(user._id)
  const enrolled = Boolean(profile?.enrolled && profile?.enabled)

  if (!enrolled) {
    // Nobody has enrolled this user yet. Left alone unless the stricter
    // rollout flag is on, so turning FACE_VERIFICATION_REQUIRED on doesn't
    // instantly lock out every legacy employee.
    if (!env.FACE_VERIFICATION_ENFORCE_UNENROLLED) return null
    throw ApiError.forbidden(
      'Face verification has not been set up for your account yet. Contact an administrator.',
      'FACE_NOT_ENROLLED'
    )
  }

  const verifiedToday =
    profile.lastVerifiedAt && isSameLocalDay(profile.lastVerifiedAt, new Date(), env.APP_TIMEZONE)
  if (verifiedToday) return null

  const verificationToken = generateOpaqueToken()
  await faceVerificationChallengeRepository.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(verificationToken),
    expiresAt: new Date(Date.now() + env.FACE_CHALLENGE_TTL_SECONDS * 1000),
  })

  return { requiresFaceVerification: true, verificationToken }
}

export const authService = {
  async login({ identifier, password, captchaToken }, meta) {
    await verifyCaptcha(captchaToken)

    const user = await userRepository.findByIdentifier(identifier)

    if (!user || !user.isActive) {
      await auditLogRepository.record({
        action: 'LOGIN_FAILED',
        entity: 'User',
        metadata: { identifier },
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS')
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await auditLogRepository.record({
        actor: user._id,
        action: 'LOGIN_BLOCKED_LOCKED',
        entity: 'User',
        entityId: user._id.toString(),
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      throw ApiError.tooManyRequests(
        'Account is temporarily locked due to repeated failed attempts',
        'ACCOUNT_LOCKED'
      )
    }

    const passwordValid = await verifyPassword(user.passwordHash, password)
    if (!passwordValid) {
      await userRepository.registerFailedLogin(user._id, {
        maxAttempts: env.LOGIN_MAX_ATTEMPTS,
        lockMinutes: env.LOGIN_LOCK_MINUTES,
      })
      await auditLogRepository.record({
        actor: user._id,
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user._id.toString(),
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS')
    }

    await userRepository.resetFailedLogins(user._id)

    // Credentials are valid — audited as LOGIN_SUCCESS right here regardless
    // of what happens next. A pending face check is a second factor on top
    // of a successful login, not a reason to call the password step
    // anything other than what it was.
    await auditLogRepository.record({
      actor: user._id,
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: user._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    const pendingFaceVerification = await issueFaceChallengeIfRequired(user)
    if (pendingFaceVerification) return pendingFaceVerification

    const role = await roleRepository.findById(user.roleId)
    const accessToken = generateAccessToken(user, role)
    const { refreshToken } = await issueSession(user, meta)

    return { accessToken, refreshToken, user: toPublicUser(user, role) }
  },

  async refresh(refreshToken, meta) {
    if (!refreshToken) throw ApiError.unauthorized('Missing refresh token', 'MISSING_REFRESH_TOKEN')

    const tokenHash = hashOpaqueToken(refreshToken)
    const session = await sessionRepository.findActiveByTokenHash(tokenHash)

    if (!session) throw ApiError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN')

    if (session.revoked) {
      // Reuse of an already-rotated token — treat as theft and kill the whole session family.
      await sessionRepository.revokeAllForUser(session.userId)
      logger.warn('Refresh token reuse detected — session family revoked', {
        userId: session.userId.toString(),
      })
      throw ApiError.unauthorized('Session invalidated, please log in again', 'REFRESH_REUSE_DETECTED')
    }

    if (session.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token expired', 'REFRESH_EXPIRED')
    }

    const user = await userRepository.findById(session.userId)
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Account no longer active', 'ACCOUNT_INACTIVE')
    }

    const role = await roleRepository.findById(user.roleId)
    const accessToken = generateAccessToken(user, role)
    const { refreshToken: newRefreshToken } = await issueSession(user, meta, session._id)

    return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(user, role) }
  },

  async logout(refreshToken) {
    if (!refreshToken) return
    const tokenHash = hashOpaqueToken(refreshToken)
    const session = await sessionRepository.findActiveByTokenHash(tokenHash)
    if (session) await sessionRepository.revoke(session._id)
  },

  async requestPasswordReset(identifier) {
    const user = await userRepository.findByIdentifier(identifier)
    // Always behave the same whether or not the account exists, so this
    // endpoint can't be used to enumerate valid JSHSHIRs/emails.
    if (!user) return

    const rawToken = generateOpaqueToken()
    const tokenHash = hashOpaqueToken(rawToken)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    await userRepository.setPasswordResetToken(user._id, tokenHash, expiresAt)

    // No email/SMS provider is wired up yet — logged so the flow is usable
    // in dev. Swap this for a real notifier when Phase 12 (Notifications)
    // lands; the token/expiry logic here doesn't need to change.
    logger.info('Password reset token issued', { userId: user._id.toString(), rawToken })
  },

  async confirmPasswordReset(rawToken, newPassword) {
    const tokenHash = hashOpaqueToken(rawToken)
    const user = await userRepository.findByValidResetTokenHash(tokenHash)
    if (!user) throw ApiError.badRequest('Invalid or expired reset token', 'INVALID_RESET_TOKEN')

    const passwordHash = await hashPassword(newPassword)
    await userRepository.setPassword(user._id, passwordHash)
    await sessionRepository.revokeAllForUser(user._id)
  },
}
