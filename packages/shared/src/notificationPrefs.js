/**
 * Which notifications a person may switch off, and what "off" means.
 *
 * Shared because both sides need the same answer: the API rejects an attempt
 * to disable a mandatory type, and the settings screen has to render that
 * toggle as locked rather than letting someone flip it and receive a 400.
 * Two copies of this list would drift, and the drift would look like a bug
 * in the UI.
 */

export const NOTIFICATION_CHANNELS = ['inApp', 'email', 'push']

/**
 * Types nobody may turn off (§9.3).
 *
 * The rule behind the list, so a future type can be judged against it rather
 * than guessed: a notification is mandatory when *not receiving it* is worse
 * for the person than the annoyance of receiving it.
 *
 *   account access   — without it they cannot get in at all
 *   security         — they need to know someone else signed in
 *   legal/compliance — the obligation is the company's, not a preference
 *   wasted journeys  — turning up to a cancelled event
 */
export const MANDATORY_NOTIFICATION_TYPES = [
  // Account access.
  'ACCOUNT_CREATED',
  'PASSWORD_RESET',
  // Security.
  'LOGIN_FROM_NEW_DEVICE',
  'PASSWORD_CHANGED',
  // Legal and compliance obligations.
  'CERTIFICATE_EXPIRED',
  'COMPLIANCE_RETRAINING_DUE',
  // Do not let someone travel to something that is not happening.
  'EVENT_CANCELLED',
  'EVENT_RESCHEDULED',
]

export function isMandatoryNotificationType(type) {
  return MANDATORY_NOTIFICATION_TYPES.includes(type)
}

/**
 * Preferences are stored as *deviations* from "everything on".
 *
 * The alternative — a full matrix per user — is 27 types × 3 channels of
 * rows that all say the same thing, and it goes stale the moment a type is
 * added: every existing user would be missing the new row, and code would
 * have to decide whether missing means on or off. Storing only what someone
 * has actually changed makes a new type default to on for everyone, which is
 * the behaviour we want.
 */
export function isChannelEnabled(prefs, type, channel) {
  if (isMandatoryNotificationType(type)) return true
  const forType = prefs instanceof Map ? prefs.get(type) : prefs?.[type]
  if (!forType) return true
  const value = forType instanceof Map ? forType.get(channel) : forType[channel]
  return value === undefined || value === null ? true : Boolean(value)
}

/**
 * Expands stored deviations into the full picture a settings screen renders.
 * Mandatory types come back all-on and flagged, so the UI can lock them with
 * an explanation instead of silently ignoring a click.
 */
export function resolveNotificationPrefs(prefs, types) {
  const out = {}
  for (const type of types) {
    const mandatory = isMandatoryNotificationType(type)
    out[type] = {
      mandatory,
      inApp: isChannelEnabled(prefs, type, 'inApp'),
      email: isChannelEnabled(prefs, type, 'email'),
      push: isChannelEnabled(prefs, type, 'push'),
    }
  }
  return out
}
