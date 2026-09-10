import crypto from 'node:crypto'
import { ApiKey } from '../../models/apiKey.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { hashPassword, verifyPassword } from '../../utils/hash.js'
import { ApiError } from '../../utils/ApiError.js'
import { PERMISSIONS } from '@lms/shared'

/**
 * Issuing, checking and revoking API keys (11.1).
 *
 * A key is `lms_<prefix>_<secret>`: the prefix is the lookup and the secret
 * is the password. That split is what makes a hashed secret workable —
 * without a public half, verifying a key would mean an argon2 comparison
 * against every key in the table on every request.
 */

// Which permissions a key may be granted at all. Deliberately read-only: a
// public API that can enrol people or delete a course is a different
// product with a different review, and every write path in the platform
// already has a person's authority behind it. A scope not on this list is
// refused when the key is created rather than ignored later.
export const GRANTABLE_SCOPES = [
  PERMISSIONS.USER_READ,
  PERMISSIONS.COURSE_READ,
  PERMISSIONS.NEWS_READ,
  PERMISSIONS.ANALYTICS_VIEW_ALL,
  PERMISSIONS.REPORT_EXPORT,
  PERMISSIONS.CERTIFICATE_READ_ALL,
]

const PREFIX_BYTES = 4
const SECRET_BYTES = 24

function generateKey() {
  const prefix = `lms_${crypto.randomBytes(PREFIX_BYTES).toString('hex')}`
  const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url')
  return { prefix, secret, full: `${prefix}_${secret}` }
}

/** `lms_ab12cd34_<secret>` → its two halves, or null. */
export function splitKey(raw) {
  const value = String(raw ?? '').trim()
  const match = /^(lms_[a-f\d]{8})_([A-Za-z0-9_-]{20,})$/.exec(value)
  return match ? { prefix: match[1], secret: match[2], full: value } : null
}

function toPublicKey(key, { full } = {}) {
  return {
    id: key._id.toString(),
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    includePii: key.includePii,
    rateLimitPerMinute: key.rateLimitPerMinute,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    lastUsedAt: key.lastUsedAt,
    requestCount: key.requestCount,
    createdAt: key.createdAt,
    // Only ever present in the response that created it.
    ...(full ? { key: full } : {}),
  }
}

export const apiKeyService = {
  async list() {
    const keys = await ApiKey.find({}).sort({ createdAt: -1 })
    return keys.map((key) => toPublicKey(key))
  },

  /**
   * Creates a key and returns it **once**.
   *
   * The caller has to store it now; no endpoint can show it again, because
   * the platform does not have it — only its hash.
   */
  async create(actor, { name, scopes = [], includePii = false, rateLimitPerMinute, expiresAt }) {
    const unknown = scopes.filter((scope) => !GRANTABLE_SCOPES.includes(scope))
    if (unknown.length) {
      throw ApiError.badRequest(`These scopes cannot be granted to a key: ${unknown.join(', ')}`, 'SCOPE_NOT_GRANTABLE')
    }
    if (!scopes.length) throw ApiError.badRequest('A key with no scopes can read nothing', 'NO_SCOPES')

    const { prefix, full } = generateKey()
    const key = await ApiKey.create({
      name,
      prefix,
      // Argon2, the same as a password, for the same reason: a leaked
      // database must not hand over working credentials.
      hash: await hashPassword(full),
      scopes,
      includePii: Boolean(includePii),
      ...(rateLimitPerMinute ? { rateLimitPerMinute } : {}),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: actor.id,
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'API_KEY_CREATED',
      entity: 'ApiKey',
      entityId: key._id.toString(),
      metadata: { name, prefix, scopes, includePii: Boolean(includePii) },
    })

    return toPublicKey(key, { full })
  },

  async revoke(actor, id) {
    const key = await ApiKey.findById(id)
    if (!key) throw ApiError.notFound('Key not found')
    if (!key.revokedAt) {
      key.revokedAt = new Date()
      key.revokedBy = actor.id
      await key.save()
      await auditLogRepository.record({
        actor: actor.id,
        action: 'API_KEY_REVOKED',
        entity: 'ApiKey',
        entityId: String(id),
        metadata: { name: key.name, prefix: key.prefix },
      })
    }
    // Revoked, not deleted: the audit trail of what that key read is worth
    // more than a tidy table, and a deleted prefix could be reissued.
    return toPublicKey(key)
  },

  /**
   * Verifies a presented key.
   *
   * @returns the key document, or null — never a reason. A caller with a
   *   bad key learns only that it does not work; whether it was revoked,
   *   expired or never existed is exactly what somebody enumerating
   *   prefixes would want to know.
   */
  async verify(raw) {
    const parts = splitKey(raw)
    if (!parts) return null

    const key = await ApiKey.findOne({ prefix: parts.prefix })
    if (!key) return null
    if (key.revokedAt) return null
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null

    const ok = await verifyPassword(key.hash, parts.full).catch(() => false)
    return ok ? key : null
  },

  /**
   * Records that a key was used.
   *
   * Fire-and-forget: the counter answers "is this key still in use?", and a
   * slow write must not add latency to every public request. `updateOne`
   * rather than `save()` so two concurrent requests cannot overwrite each
   * other's count.
   */
  touch(key, ip) {
    return ApiKey.updateOne(
      { _id: key._id },
      { $set: { lastUsedAt: new Date(), lastUsedIp: String(ip ?? '').slice(0, 45) }, $inc: { requestCount: 1 } }
    ).catch(() => {})
  },
}
