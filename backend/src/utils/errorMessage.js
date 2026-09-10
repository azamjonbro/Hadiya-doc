/**
 * A description of an error that is never the empty string.
 *
 * `error.message` is the obvious answer and is usually right, but two common
 * cases hand back nothing at all:
 *
 *   - Node's AggregateError from a failed multi-address connect. Trying to
 *     reach a down MinIO produces `AggregateError [ECONNREFUSED]` whose
 *     `message` is '' and whose real causes are in `errors`.
 *   - Anything thrown that is not an Error — a string, a rejected promise
 *     carrying an object.
 *
 * That matters wherever the message is the only record of what went wrong.
 * An export job that says FAILED with a blank reason is unactionable both
 * for the admin looking at it and for whoever is asked why it broke.
 */
export function errorMessage(error, fallback = 'Unknown error') {
  if (!error) return fallback

  const direct = typeof error === 'string' ? error : error.message
  if (direct) return direct

  // AggregateError: the causes are the message.
  if (Array.isArray(error.errors) && error.errors.length) {
    const causes = [...new Set(error.errors.map((inner) => errorMessage(inner, '')).filter(Boolean))]
    if (causes.length) return `${error.name ?? 'AggregateError'}: ${causes.join('; ')}`
  }

  // A bare error with a code and no message still says more than nothing.
  const parts = [error.name, error.code].filter(Boolean)
  if (parts.length) return parts.join(' ')

  const stringified = String(error)
  return stringified && stringified !== '[object Object]' ? stringified : fallback
}
