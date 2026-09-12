import { resolveRoleScope } from '@lms/shared'
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
import { notificationService } from '../notifications/notification.service.js'
import { isMailConfigured } from '../notifications/mail.service.js'
import { formatNotificationDateTime } from '../../utils/notificationFormat.js'
import { twoFactorService } from './twoFactor.service.js'

// One hour (AT-14). Long enough to survive a mail queue retrying and a
// person reading it later in the day; short enough that a link left in an
// inbox is not a standing key to the account.
const PASSWORD_RESET_TTL_MINUTES = 60

// Exported so faceVerification.service.js can complete a login the exact
// same way (mint access + refresh tokens) once the extra face check passes
// — one token-issuing path, not two.
export function toPublicUser(user, role) {
  return {
    id: user._id.toString(),
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    patronymic: user.patronymic ?? '',
    fullName: user.fullName,
    jshshir: user.jshshir,
    email: user.email ?? '',
    branch: user.branch ?? '',
    department: user.department,
    position: user.position,
    avatar: user.avatar,
    role: role.name,
    permissions: role.permissions,
    // The SPA's router reads this before /users/me has answered: without
    // it a SUPERADMIN reloading /bos was bounced to the team dashboard as
    // "scoped" for the first paint.
    scope: resolveRoleScope(role),
  }
}

// How long a rotated refresh token is still forgiven under `grace`.
const REFRESH_REUSE_GRACE_MS = 60 * 1000

export async function issueSession(user, meta, replacesSessionId = null) {
  // Asked before the session is written, or the row we are about to create
  // would itself be the "already seen" evidence.
  const seenBefore = await sessionRepository.hasSeenUserAgent(user._id, meta.userAgent)

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

  // A refresh reuses the device that is already signed in, so only a fresh
  // login can be from somewhere new — `replacesSessionId` is what tells them
  // apart, and alerting on every token refresh would train people to ignore
  // the alert entirely.
  if (!seenBefore && !replacesSessionId) {
    // Never awaited and never allowed to throw: a notification failure must
    // not stop someone signing in.
    notificationService
      .notify({
        userId: user._id,
        type: 'LOGIN_FROM_NEW_DEVICE',
        vars: {
          device: meta.userAgent || 'noma\'lum qurilma',
          ipAddress: meta.ip || '',
          loginAt: formatNotificationDateTime(new Date()),
        },
        severity: 'WARNING',
      })
      .catch((error) => logger.warn('Could not send new-device alert', { error: error.message }))
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

  // No reference photo on file: sign in, and let the first screen that needs
  // a face walk them through capturing one (POST /auth/face/self-enroll).
  // Refusing the login instead — which is what this did while only SUPERADMIN
  // could enrol — left a new employee with nothing to do but phone an admin.
  if (!enrolled) return null

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

/**
 * Turns "this is definitely them" into a session.
 *
 * Exported so single sign-on (11.4) finishes a login through the exact
 * same path a password login does — including the face challenge, which is
 * a second factor on the *person*, not on the password: an SSO login that
 * skipped it would be a way around a policy somebody switched on.
 */
export async function establishSession(user, meta) {
  const pendingFaceVerification = await issueFaceChallengeIfRequired(user)
  if (pendingFaceVerification) return pendingFaceVerification

  const role = await roleRepository.findById(user.roleId)
  const accessToken = generateAccessToken(user, role)
  const { refreshToken } = await issueSession(user, meta)
  return { accessToken, refreshToken, user: toPublicUser(user, role) }
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

    /**
     * The second factor stands between a correct password and a session
     * (11.6), the same way the face check does — and *before* it, because
     * a code from an app is cheaper to produce than a camera frame and
     * failing the cheap check first is less work for everybody.
     */
    const twoFactorChallenge = await twoFactorService.challengeIfRequired(user)
    if (twoFactorChallenge) return twoFactorChallenge

    return establishSession(user, meta)
  },

  async refresh(refreshToken, meta) {
    if (!refreshToken) throw ApiError.unauthorized('Missing refresh token', 'MISSING_REFRESH_TOKEN')

    const tokenHash = hashOpaqueToken(refreshToken)
    const session = await sessionRepository.findActiveByTokenHash(tokenHash)

    if (!session) throw ApiError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN')

    let live = session
    if (session.revoked) {
      // Reuse of an already-rotated token. In the browser this is almost
      // always two tabs reloading at once, or a request that left before
      // the new cookie arrived — the same device, twice. So the token is
      // forgiven inside a short window (or always, with detection off) and
      // the request is served from the live end of the rotation chain.
      // Outside that window it is treated as theft: the whole family goes.
      const mode = env.REFRESH_REUSE_DETECTION
      const rotatedAgoMs = Date.now() - new Date(session.updatedAt ?? 0).getTime()
      const forgiven = mode === 'off' || (mode === 'grace' && rotatedAgoMs <= REFRESH_REUSE_GRACE_MS)
      const replacement = forgiven ? await sessionRepository.findLiveReplacement(session) : null
      if (!replacement) {
        if (mode !== 'off') await sessionRepository.revokeAllForUser(session.userId)
        logger.warn('Refresh token reuse detected', {
          userId: session.userId.toString(),
          mode,
          rotatedAgoMs,
          familyRevoked: mode !== 'off',
        })
        throw ApiError.unauthorized('Session invalidated, please log in again', 'REFRESH_REUSE_DETECTED')
      }
      live = replacement
    }

    if (live.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token expired', 'REFRESH_EXPIRED')
    }

    const user = await userRepository.findById(live.userId)
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Account no longer active', 'ACCOUNT_INACTIVE')
    }

    const role = await roleRepository.findById(user.roleId)
    const accessToken = generateAccessToken(user, role)
    const { refreshToken: newRefreshToken } = await issueSession(user, meta, live._id)

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
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000)
    await userRepository.setPasswordResetToken(user._id, tokenHash, expiresAt)

    // PASSWORD_RESET is mandatory (§9.3), so this reaches the person
    // whatever their preferences say — a notification nobody can switch off
    // is precisely the one that gets them back into their account.
    //
    // Awaited, unlike most notify() calls: the queueing is what makes this
    // endpoint do anything at all, and a failure here should surface rather
    // than leave the caller with a 200 and no mail.
    await notificationService.notify({
      userId: user._id,
      type: 'PASSWORD_RESET',
      vars: {
        resetUrl: `${env.APP_URL}/reset-password?token=${rawToken}`,
        expiryMinutes: PASSWORD_RESET_TTL_MINUTES,
      },
      severity: 'WARNING',
      relatedEntityType: 'User',
      relatedEntityId: user._id.toString(),
    })

    // Without a relay there is no other way to obtain the token, and a
    // developer who cannot reset a password cannot test the flow. Never in
    // production, and never once SMTP is configured: a reset token in a log
    // is a password in a log.
    if (!isMailConfigured() && !env.isProduction) {
      logger.warn('SMTP is not configured — password reset token logged for local use only', {
        userId: user._id.toString(),
        rawToken,
      })
    }
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
