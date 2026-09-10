/**
 * Keys for retry-safe writes (11.5).
 *
 * The key is generated **once per action a person took** — one press of
 * send, one submit — and reused by every retry of it. Generating a fresh
 * key per HTTP attempt would defeat the whole point: the server would see
 * two different operations and perform both.
 */
export function newIdempotencyKey() {
  // randomUUID needs a secure context; a plain http:// dev origin does
  // not have one, and a key that throws on a laptop would make the
  // feature untestable there.
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** An axios config fragment carrying the header. */
export function idempotencyHeaders(key) {
  return key ? { headers: { 'Idempotency-Key': key } } : {}
}
