import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { ApiError } from './ApiError.js'

/**
 * Encryption at rest for secrets the platform has to be able to read back
 * (11.6).
 *
 * A TOTP secret cannot be hashed the way a password is — verifying a code
 * means recomputing it, which needs the secret itself. So it is encrypted
 * instead, with a key that lives in the environment rather than in the
 * database: a dump of Mongo alone then contains no working second factor,
 * which is most of what "at rest" is for.
 *
 * **Refuses to work without a key** rather than falling back to plaintext.
 * A silent fallback is how a deployment ends up storing second factors in
 * the clear and nobody finds out; an explicit 503 on the enrolment
 * endpoint is a sentence somebody can act on.
 */

const VERSION = 'v1'

function key() {
  const configured = env.TWOFA_SECRET_KEY
  if (!configured) {
    throw ApiError.serviceUnavailable(
      'TWOFA_SECRET_KEY is not configured, so two-factor secrets cannot be stored safely',
      'TWOFA_KEY_MISSING'
    )
  }
  // A 64-character hex string is used as raw key material; anything else is
  // stretched, so a deployment that puts a passphrase there still gets a
  // 32-byte key instead of a confusing error.
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, 'hex')
  return crypto.scryptSync(configured, 'qollanma-2fa', 32)
}

export function isSecretBoxConfigured() {
  return Boolean(env.TWOFA_SECRET_KEY)
}

/** `v1:<iv>:<tag>:<ciphertext>`, all base64url. */
export function seal(plaintext) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const sealed = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  // GCM's tag is what makes this tamper-evident: without it, a modified
  // ciphertext decrypts to garbage that the caller cannot tell from a
  // real secret.
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), sealed.toString('base64url')].join(
    ':'
  )
}

export function open(sealed) {
  const [version, iv, tag, payload] = String(sealed ?? '').split(':')
  if (version !== VERSION || !iv || !tag || !payload) {
    throw ApiError.internal('Stored secret is not in a readable format', 'SECRET_UNREADABLE')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  try {
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    // Either the key changed or the row was tampered with. Both mean the
    // stored secret is unusable, and saying so beats returning nonsense
    // that fails as a wrong code.
    throw ApiError.internal('Stored secret could not be decrypted', 'SECRET_UNREADABLE')
  }
}
