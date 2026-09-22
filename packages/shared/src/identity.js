// Employee identity and credential rules, shared by the API and both SPAs so a
// form can reject a malformed JSHSHIR before a round trip and the server can
// reject the same value for the same reason.

/** JSHSHIR (PINFL) — the 14-digit personal identification number. */
export const JSHSHIR_PATTERN = /^\d{14}$/
export const JSHSHIR_LENGTH = 14

/** Spaces and dashes are how people read these numbers aloud; strip them. */
export function normalizeJshshir(value) {
  return String(value ?? '').replace(/[\s-]/g, '')
}

export function isJshshir(value) {
  return JSHSHIR_PATTERN.test(normalizeJshshir(value))
}

/**
 * Every character an admin might have to read down a phone line, minus the
 * pairs that get misheard or mistyped: no `i`/`l`/`1`, no `o`/`0`. 31 symbols,
 * so a 6-character password is one of ~887 million.
 */
export const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const GENERATED_PASSWORD_LENGTH = 6
/** The floor the API enforces — a generated password must not be rejected by it. */
export const PASSWORD_MIN_LENGTH = 6

/**
 * Uniformly random password from PASSWORD_ALPHABET.
 *
 * Uses the platform CSPRNG (`crypto.getRandomValues`, present in Node 18+ and
 * every supported browser) rather than Math.random, because these are real
 * account credentials. Bytes that would skew the distribution are discarded
 * instead of folded with `%` — with a 31-symbol alphabet, plain modulo would
 * make the first eight letters ~3% likelier than the rest.
 */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH) {
  const alphabet = PASSWORD_ALPHABET
  const limit = Math.floor(256 / alphabet.length) * alphabet.length
  let out = ''

  while (out.length < length) {
    const bytes = new Uint8Array(length - out.length)
    globalThis.crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= limit) continue
      out += alphabet[byte % alphabet.length]
    }
  }

  return out
}
