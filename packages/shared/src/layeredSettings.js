/**
 * "Defaults, then the global setting, then this course's override."
 *
 * Three places already resolve settings that way — the attention policy,
 * the face policy, and now the platform settings — and each had its own
 * copy of the same eight lines. The copies agreed, which is exactly why
 * they were worth merging: the next one would have been written from
 * memory, and the interesting question (does `false` mean "off" or
 * "inherit"?) has only one right answer.
 *
 * It is `null`/`undefined` that mean "inherit". `false` and `0` are real
 * values and override the layer beneath — a course that switches a check
 * off must not silently inherit it back from the global policy.
 */
export function resolveLayered(defaults, fields, layers) {
  const resolved = { ...defaults }
  for (const layer of layers) {
    if (!layer) continue
    for (const field of fields) {
      const value = layer[field]
      if (value !== undefined && value !== null) resolved[field] = value
    }
  }
  return resolved
}

/**
 * The stored half: only the fields this layer actually sets.
 *
 * A Mongoose document carries every schema path, including the ones nobody
 * set. Stripping them is what keeps "inherit" distinguishable from "off"
 * once the row crosses into JSON — without it, every override document
 * would look like it had opinions about every field.
 */
export function pickStoredLayer(doc, fields) {
  if (!doc) return null
  const stored = {}
  for (const field of fields) {
    if (doc[field] !== undefined && doc[field] !== null) stored[field] = doc[field]
  }
  return stored
}

/**
 * Splits an incoming patch into what to write and what to clear.
 *
 * An explicit `null` means "stop overriding this and go back to
 * inheriting", which is a different request from "set it to false" — and
 * the only way to express it in JSON.
 */
export function splitLayerPatch(payload, fields) {
  const set = {}
  const unset = []
  for (const field of fields) {
    if (!(field in payload)) continue
    if (payload[field] === null) unset.push(field)
    else set[field] = payload[field]
  }
  return { set, unset }
}
