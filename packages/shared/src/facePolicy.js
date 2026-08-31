/**
 * Organisation-wide settings for the identity check (see face verification in
 * docs/face-verification.md). Deliberately separate from ATTENTION_POLICY:
 * "is this the enrolled employee" and "did someone else appear during the
 * lesson" are different questions answered by different systems, and merging
 * their settings would have made the two look like one feature in the admin UI.
 *
 * Shared because the API enforces these, the admin UI edits them, and both
 * front ends name the same gated actions.
 */
export const FACE_POLICY_DEFAULTS = Object.freeze({
  // How often the check is asked for.
  //   false — once per day, per employee. The original behaviour.
  //   true  — before every single video, material and test that is opened.
  // Off by default: turning it on is a real cost to every employee's day, so
  // it is a decision somebody makes, not one that arrives with an upgrade.
  verifyEveryOpen: false,
})

export const FACE_POLICY_FIELDS = Object.freeze(Object.keys(FACE_POLICY_DEFAULTS))

/**
 * What the gate is standing in front of. Carried in the 403's `details.action`
 * so the client can say "before opening this presentation" rather than always
 * naming a video.
 */
export const FACE_GATE_ACTIONS = Object.freeze({
  VIDEO: 'video',
  MATERIAL: 'material',
  ASSESSMENT: 'assessment',
})

/** Same merge rule as resolveAttentionPolicy: an unset field inherits. */
export function resolveFacePolicy(...layers) {
  const resolved = { ...FACE_POLICY_DEFAULTS }
  for (const layer of layers) {
    if (!layer) continue
    for (const field of FACE_POLICY_FIELDS) {
      const value = layer[field]
      if (value !== undefined && value !== null) resolved[field] = value
    }
  }
  return resolved
}
