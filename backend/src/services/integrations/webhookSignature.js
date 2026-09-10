import crypto from 'node:crypto'

/**
 * How a receiver knows a delivery really came from us (11.2).
 *
 * HMAC-SHA256 over `${timestamp}.${body}` with the subscription's secret,
 * sent as `t=<unix>,v1=<hex>` — the shape Stripe and GitHub use, because
 * the receiver most likely already has code for it.
 *
 * **The timestamp is inside the signed string on purpose.** Signing the
 * body alone produces a token that stays valid forever: anyone who
 * captures one delivery can replay it at any time and the signature still
 * checks out. With the timestamp signed, a replay can be rejected on age
 * without the attacker being able to move it — changing the timestamp
 * breaks the MAC.
 *
 * `v1=` is a version marker, not decoration. When the algorithm has to
 * change, deliveries can carry `v1` and `v2` together for a release, and
 * receivers move without a flag day.
 */

export const SIGNATURE_HEADER = 'x-qollanma-signature'
export const EVENT_HEADER = 'x-qollanma-event'
export const DELIVERY_HEADER = 'x-qollanma-delivery'
export const ATTEMPT_HEADER = 'x-qollanma-attempt'

/** Signing secrets are shown once, like a key (11.1). */
export function generateSecret() {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`
}

export function signPayload({ secret, body, timestamp = Math.floor(Date.now() / 1000) }) {
  const mac = crypto.createHmac('sha256', String(secret)).update(`${timestamp}.${body}`).digest('hex')
  return { header: `t=${timestamp},v1=${mac}`, timestamp, mac }
}

function parseHeader(value) {
  const parts = String(value ?? '')
    .split(',')
    .map((part) => part.trim().split('='))
  const map = new Map(parts.filter((pair) => pair.length === 2))
  const timestamp = Number(map.get('t'))
  const mac = map.get('v1')
  return Number.isFinite(timestamp) && mac ? { timestamp, mac } : null
}

/**
 * The check a receiver performs — here because our own tests are a
 * receiver, and because an implementation nobody runs is an implementation
 * nobody knows is wrong.
 *
 * `timingSafeEqual` rather than `===`: a comparison that returns early on
 * the first wrong byte leaks how much of a forged MAC was right, which is
 * enough to construct the rest one byte at a time.
 */
export function verifySignature({ secret, body, header, toleranceSeconds = 300, now = Date.now() }) {
  const parsed = parseHeader(header)
  if (!parsed) return false
  if (Math.abs(Math.floor(now / 1000) - parsed.timestamp) > toleranceSeconds) return false

  const expected = signPayload({ secret, body, timestamp: parsed.timestamp }).mac
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(parsed.mac, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
