import crypto from 'node:crypto'

/**
 * TOTP (RFC 6238) over `node:crypto` (11.6).
 *
 * No dependency, because the algorithm is thirty lines and the parts that
 * matter are the parts a wrapper hides: the size of the window, whether a
 * code can be used twice, and whether the comparison is timing-safe.
 *
 * SHA-1 with a 30-second step and six digits is not a choice — it is what
 * every authenticator app implements. A "stronger" configuration here
 * would produce codes Google Authenticator cannot generate, which is the
 * only property that matters.
 */

const DIGITS = 6
const STEP_SECONDS = 30
// One step either side. Zero would refuse a code from a phone whose clock
// is two seconds off; three would triple the guessing surface for no
// practical gain.
const WINDOW = 1

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Base32 without padding — what an otpauth:// URI carries. */
export function toBase32(buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function fromBase32(text) {
  let bits = 0
  let value = 0
  const bytes = []
  for (const char of String(text).toUpperCase().replace(/[\s=]/g, '')) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index < 0) throw new Error('Not base32')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** A 160-bit secret — the length RFC 4226 recommends for HMAC-SHA1. */
export function generateSecret() {
  return toBase32(crypto.randomBytes(20))
}

/** The code for one time step. */
export function codeFor(secret, counter) {
  const key = fromBase32(secret)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', key).update(buffer).digest()
  // Dynamic truncation, RFC 4226 §5.3.
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function counterFor(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS)
}

/**
 * Verifies a code and says **which step** it matched.
 *
 * Returning the counter rather than a boolean is what lets the caller
 * refuse a code that was already used: a six-digit code is valid for at
 * least thirty seconds, so without storing the last accepted step, one
 * observed code can be replayed for the rest of its window.
 *
 * @returns {number|null} the matched counter, or null.
 */
export function verifyCode(secret, code, { now = Date.now(), window = WINDOW } = {}) {
  const candidate = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(candidate)) return null

  const current = counterFor(now)
  for (let drift = -window; drift <= window; drift += 1) {
    const counter = current + drift
    const expected = codeFor(secret, counter)
    // timingSafeEqual on six digits is close to theatre, but the habit is
    // the point: a comparison that returns early is the bug, and nobody
    // reading this later has to decide whether it matters here.
    const a = Buffer.from(expected)
    const b = Buffer.from(candidate)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return counter
  }
  return null
}

/**
 * The URI an authenticator app scans.
 *
 * The issuer appears twice — as a prefix on the label and as a parameter —
 * because different apps read different ones, and the one that shows up in
 * somebody's app list is how they know which account a code belongs to.
 */
export function otpauthUri({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

export const _internals = { DIGITS, STEP_SECONDS, WINDOW }
