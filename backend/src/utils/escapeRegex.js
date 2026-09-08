/**
 * Turns a user-supplied search string into a literal regex fragment.
 *
 * Free-text search boxes feed straight into `new RegExp(...)` in several
 * repositories. Without escaping, a caller can send a pattern rather than a
 * word: `(a+)+$` is a classic catastrophic-backtracking input that pins a CPU
 * core for as long as the request runs, and `.*` quietly turns a "starts with"
 * filter into "matches everything".
 *
 * `user.repository.js` already did this inline; this is that same expression,
 * lifted so every search path uses one implementation instead of each
 * remembering to.
 */
export function escapeRegex(input) {
  return String(input ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Case-insensitive "contains" matcher for a literal user-typed term. */
export function containsRegex(input) {
  return new RegExp(escapeRegex(String(input ?? '').trim()), 'i')
}
