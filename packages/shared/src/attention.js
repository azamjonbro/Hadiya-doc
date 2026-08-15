/**
 * Camera-based attention monitoring during video playback.
 *
 * The policy is resolved in three layers — these defaults, then the global
 * policy row, then a per-course override — so a course only has to store the
 * knobs it actually disagrees with. Shared here because the backend enforces
 * the numbers, the employee app acts on them in real time, and the admin UI
 * renders them as form defaults; three copies would drift.
 */
export const ATTENTION_POLICY_DEFAULTS = Object.freeze({
  // Off unless an admin deliberately turns it on — nobody's camera should
  // start because a feature shipped.
  enabled: false,
  // Seconds of continuous looking-away before it counts as inattention.
  // Short glances (reaching for a cup, someone entering the room) must not
  // trigger anything, or the warnings become noise people learn to ignore.
  graceSeconds: 4,
  // Pause the video while attention is lost.
  pauseOnWarning: true,
  // Warnings in one session before the player locks. 0 disables lockout.
  lockoutAfterWarnings: 3,
  lockoutSeconds: 20,
  // Inattentive stretches are not credited as watched, so the learner has to
  // go back over them before the video can complete.
  requireRewatch: true,
  // Inattention events on a single video before the learner's manager is
  // notified. 0 disables the notification.
  notifyManagerAfter: 5,
})

// Note there is deliberately no "camera optional" setting. On a monitored
// course the camera is mandatory: an opt-out button would make the whole
// policy advisory, since anyone who did not want to be watched would simply
// click it. `enabled: false` is how a course goes unmonitored.

export const ATTENTION_POLICY_FIELDS = Object.freeze(Object.keys(ATTENTION_POLICY_DEFAULTS))

/** Event types the player reports; stored on VideoAnalyticsEvent.eventType. */
export const ATTENTION_EVENTS = Object.freeze({
  LOST: 'attentionLost',
  REGAINED: 'attentionRegained',
  WARNING_SHOWN: 'attentionWarning',
  LOCKOUT: 'attentionLockout',
  CAMERA_DENIED: 'cameraDenied',
  CAMERA_ERROR: 'cameraError',
})

/** Why attention was considered lost — carried in the event metadata. */
export const ATTENTION_REASONS = Object.freeze({
  NO_FACE: 'noFace',
  LOOKING_AWAY: 'lookingAway',
  MULTIPLE_FACES: 'multipleFaces',
})

/**
 * Merges the policy layers, ignoring keys an override left unset. Overrides
 * store partial documents, so `undefined`/`null` means "inherit" rather than
 * "set to nothing" — without this check a sparse override would blank out
 * every field it does not mention.
 */
export function resolveAttentionPolicy(...layers) {
  const resolved = { ...ATTENTION_POLICY_DEFAULTS }
  for (const layer of layers) {
    if (!layer) continue
    for (const field of ATTENTION_POLICY_FIELDS) {
      const value = layer[field]
      if (value !== undefined && value !== null) resolved[field] = value
    }
  }
  return resolved
}
