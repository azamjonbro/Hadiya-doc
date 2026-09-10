import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { User } from '../../models/user.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { settingsService } from '../settings/settings.service.js'
import { establishSession } from './auth.service.js'
import { hashPassword, verifyPassword } from '../../utils/hash.js'
import { generateOpaqueToken, hashOpaqueToken } from '../../utils/tokens.js'
import { generateSecret, otpauthUri, verifyCode } from '../../utils/totp.js'
import { isSecretBoxConfigured, open, seal } from '../../utils/secretBox.js'
import { ApiError } from '../../utils/ApiError.js'
import { redisConnection } from '../../config/redis.js'
import { logger } from '../../config/logger.js'

/**
 * Two-factor authentication (11.6).
 *
 * TOTP rather than SMS: a code sent to a phone number is only as strong as
 * the mobile operator's willingness to reissue a SIM, it costs money per
 * login, and it does not work in a building with no signal — which
 * describes a fair number of the places this platform is used.
 *
 * The login flow mirrors the face challenge (0.x): a correct password
 * returns a **challenge token**, not a session, and the second factor
 * exchanges it. One shape for "credentials were right but you are not in
 * yet", so the SPA has one branch rather than two.
 */

// How long the second step may take. Ninety seconds is three TOTP windows
// — enough to open an app and read a code, not enough for a challenge left
// in a terminal to be useful later.
const CHALLENGE_TTL_SECONDS = 90
// Attempts against one challenge before it is burnt. Six digits is a
// million possibilities, so this is not about entropy — it is about a
// script trying a thousand of them while somebody's window is open.
const MAX_ATTEMPTS = 5
const RECOVERY_CODE_COUNT = 10

const challengeKey = (token) => `2fa:challenge:${hashOpaqueToken(token)}`

/** `A1B2-C3D4` — grouped so somebody can read one off paper. */
function generateRecoveryCode() {
  const raw = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`
}

async function issueRecoveryCodes(user) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
  // Argon2, like a password: these *are* passwords — each one signs in on
  // its own.
  const hashes = await Promise.all(codes.map((code) => hashPassword(code)))
  await User.updateOne(
    { _id: user._id },
    { $set: { 'twoFactor.recoveryCodes': hashes, 'twoFactor.recoveryCodesIssuedAt': new Date() } }
  )
  // Returned once. The platform keeps hashes, so no endpoint can show them
  // again — same contract as an API key.
  return codes
}

export const twoFactorService = {
  /** What the account settings screen needs to draw itself. */
  async status(actor) {
    const user = await userRepository.findById(actor.id)
    if (!user) throw ApiError.notFound('User not found')
    const security = await settingsService.section('security')
    return {
      enabled: Boolean(user.twoFactor?.enabled),
      // Whether the platform *can* store a secret at all — an operator's
      // job, and a different sentence from "you have not set this up".
      available: isSecretBoxConfigured(),
      required: Boolean(security?.requireTwoFactor),
      confirmedAt: user.twoFactor?.confirmedAt ?? null,
      recoveryCodesLeft: user.twoFactor?.recoveryCodes?.length ?? 0,
      recoveryCodesIssuedAt: user.twoFactor?.recoveryCodesIssuedAt ?? null,
    }
  },

  /**
   * Begins enrolment: a secret, its URI, and a QR to scan.
   *
   * The secret is stored as `pendingSecret` and only becomes the real one
   * when a code proves the app actually has it. Enabling on the secret
   * alone would lock out anybody whose scan failed.
   */
  async beginSetup(actor) {
    const user = await userRepository.findById(actor.id)
    if (!user) throw ApiError.notFound('User not found')
    if (user.twoFactor?.enabled) {
      throw ApiError.conflict('Two-factor authentication is already on', 'TWOFA_ALREADY_ENABLED')
    }

    const secret = generateSecret()
    // `seal` throws a clear 503 when no key is configured — before
    // anything is written, so a half-enrolled account is impossible.
    const sealed = seal(secret)
    await User.updateOne({ _id: user._id }, { $set: { 'twoFactor.pendingSecret': sealed } })

    const uri = otpauthUri({ secret, account: user.jshshir, issuer: "Qo'llanma" })
    return {
      secret,
      uri,
      // A data URL rather than a file: this is shown once, on one screen,
      // and storing an image of somebody's second-factor secret would be
      // a worse idea than showing it.
      qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }),
    }
  },

  /** Confirms enrolment with the first code, and hands over recovery codes. */
  async enable(actor, code) {
    const user = await userRepository.findById(actor.id)
    if (!user) throw ApiError.notFound('User not found')
    if (user.twoFactor?.enabled) {
      throw ApiError.conflict('Two-factor authentication is already on', 'TWOFA_ALREADY_ENABLED')
    }
    if (!user.twoFactor?.pendingSecret) {
      throw ApiError.badRequest('Start the setup first', 'TWOFA_NOT_STARTED')
    }

    const secret = open(user.twoFactor.pendingSecret)
    const counter = verifyCode(secret, code)
    if (counter === null) throw ApiError.badRequest('That code is not right', 'TWOFA_CODE_INVALID')

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'twoFactor.enabled': true,
          'twoFactor.secret': user.twoFactor.pendingSecret,
          'twoFactor.pendingSecret': '',
          'twoFactor.confirmedAt': new Date(),
          'twoFactor.lastCounter': counter,
        },
      }
    )
    const recoveryCodes = await issueRecoveryCodes(user)

    await auditLogRepository.record({
      actor: user._id,
      action: 'TWOFA_ENABLED',
      entity: 'User',
      entityId: user._id.toString(),
    })
    return { enabled: true, recoveryCodes }
  },

  /**
   * Turns it off — and only with a current code or a recovery code.
   *
   * Not with the password alone: somebody who has the password is exactly
   * who the second factor is protecting the account from.
   */
  async disable(actor, code) {
    const user = await userRepository.findById(actor.id)
    if (!user) throw ApiError.notFound('User not found')
    if (!user.twoFactor?.enabled) return { enabled: false }

    const accepted = await this._verifyAnyFactor(user, code)
    if (!accepted) throw ApiError.badRequest('That code is not right', 'TWOFA_CODE_INVALID')

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'twoFactor.enabled': false,
          'twoFactor.secret': '',
          'twoFactor.pendingSecret': '',
          'twoFactor.confirmedAt': null,
          'twoFactor.lastCounter': 0,
          'twoFactor.recoveryCodes': [],
          'twoFactor.recoveryCodesIssuedAt': null,
        },
      }
    )
    await auditLogRepository.record({
      actor: user._id,
      action: 'TWOFA_DISABLED',
      entity: 'User',
      entityId: user._id.toString(),
    })
    return { enabled: false }
  },

  /** Reissues recovery codes, invalidating the old set. */
  async regenerateRecoveryCodes(actor, code) {
    const user = await userRepository.findById(actor.id)
    if (!user?.twoFactor?.enabled) throw ApiError.badRequest('Two-factor authentication is off', 'TWOFA_DISABLED')
    const accepted = await this._verifyAnyFactor(user, code)
    if (!accepted) throw ApiError.badRequest('That code is not right', 'TWOFA_CODE_INVALID')

    const codes = await issueRecoveryCodes(user)
    await auditLogRepository.record({
      actor: user._id,
      action: 'TWOFA_RECOVERY_CODES_REISSUED',
      entity: 'User',
      entityId: user._id.toString(),
    })
    return { recoveryCodes: codes }
  },

  /**
   * Called by the login path: is a second factor required, and if so, the
   * challenge that stands in for the session.
   *
   * The challenge lives in Redis rather than the database: it is worthless
   * ninety seconds from now, and a collection of expired challenges is a
   * collection somebody has to clean up.
   */
  async challengeIfRequired(user) {
    if (!user.twoFactor?.enabled) return null

    const token = generateOpaqueToken()
    await redisConnection.set(
      challengeKey(token),
      JSON.stringify({ userId: String(user._id), attempts: 0 }),
      'EX',
      CHALLENGE_TTL_SECONDS
    )
    return { requiresTwoFactor: true, twoFactorToken: token }
  },

  /**
   * Completes a login with a TOTP code or a recovery code.
   *
   * Ends in `establishSession`, the same function a password login and an
   * SSO login end in — including the face policy, which is a check on the
   * person rather than on any one factor.
   */
  async completeLogin(token, code, meta) {
    const key = challengeKey(String(token ?? ''))
    const raw = await redisConnection.get(key)
    if (!raw) throw ApiError.unauthorized('That sign-in attempt has expired — start again', 'TWOFA_CHALLENGE_UNKNOWN')

    const challenge = JSON.parse(raw)
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await redisConnection.del(key)
      throw ApiError.tooManyRequests('Too many attempts — sign in again', 'TWOFA_TOO_MANY_ATTEMPTS')
    }

    const user = await userRepository.findById(challenge.userId)
    if (!user || !user.isActive) throw ApiError.unauthorized('This account cannot sign in', 'ACCOUNT_INACTIVE')

    const accepted = await this._verifyAnyFactor(user, code)
    if (!accepted) {
      // The counter is kept on the challenge, not on the account: locking
      // the account on wrong codes would let anybody who knows a JSHSHIR
      // lock its owner out.
      await redisConnection.set(
        key,
        JSON.stringify({ ...challenge, attempts: challenge.attempts + 1 }),
        'KEEPTTL'
      )
      await auditLogRepository.record({
        actor: user._id,
        action: 'TWOFA_FAILED',
        entity: 'User',
        entityId: user._id.toString(),
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      throw ApiError.unauthorized('That code is not right', 'TWOFA_CODE_INVALID')
    }

    // Single-use: the challenge is spent whether or not the session that
    // follows succeeds.
    await redisConnection.del(key)
    await auditLogRepository.record({
      actor: user._id,
      action: accepted === 'recovery' ? 'TWOFA_RECOVERY_USED' : 'TWOFA_SUCCESS',
      entity: 'User',
      entityId: user._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    if (accepted === 'recovery') {
      logger.warn('A recovery code was used to sign in', { userId: String(user._id) })
    }

    return establishSession(user, meta)
  },

  /**
   * A TOTP code, or one of the recovery codes.
   *
   * @returns 'totp' | 'recovery' | false — which factor was accepted, so
   *   the caller can audit a recovery-code login differently. A recovery
   *   code being used is worth noticing: it usually means somebody lost
   *   their phone, and occasionally it means somebody else has their codes.
   */
  async _verifyAnyFactor(user, code) {
    const candidate = String(code ?? '').trim()
    if (!candidate) return false

    if (user.twoFactor?.secret) {
      const secret = open(user.twoFactor.secret)
      const counter = verifyCode(secret, candidate)
      if (counter !== null) {
        // Replay: a code stays valid for at least thirty seconds, so the
        // step it matched has to be refused afterwards.
        if (counter <= (user.twoFactor.lastCounter ?? 0)) return false
        await User.updateOne({ _id: user._id }, { $set: { 'twoFactor.lastCounter': counter } })
        return 'totp'
      }
    }

    const hashes = user.twoFactor?.recoveryCodes ?? []
    for (const hash of hashes) {
      // Upper-cased and dash-tolerant: these are read off paper.
      const normalized = candidate.toUpperCase().replace(/\s/g, '')
      if (await verifyPassword(hash, normalized).catch(() => false)) {
        // Single-use — a recovery code that survives its use is a
        // permanent bypass of the second factor.
        await User.updateOne({ _id: user._id }, { $pull: { 'twoFactor.recoveryCodes': hash } })
        return 'recovery'
      }
    }
    return false
  },

  _internals: { CHALLENGE_TTL_SECONDS, MAX_ATTEMPTS, RECOVERY_CODE_COUNT },
}
