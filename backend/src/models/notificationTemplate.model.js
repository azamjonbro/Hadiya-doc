import { Schema, model } from 'mongoose'

// IN_APP is the bell and the toast, EMAIL goes through the delivery queue,
// PUSH is the browser notification (1.7). TELEGRAM joins them in 1.8; it is
// not listed yet so that a row for a channel nothing can send is impossible
// to create.
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'PUSH']

// Uzbek is the default and the fallback: this is an Uzbek company, and a
// missing translation should degrade to the language everyone reads rather
// than to English.
export const NOTIFICATION_LANGS = ['uz', 'ru', 'en']
export const DEFAULT_LANG = 'uz'

/**
 * The text of one notification, for one channel, in one language.
 *
 * Editable rows in the database rather than strings in the source, because
 * the people who care most about this wording — HR, the training team — are
 * not the people who can deploy. Until 1.2 every message was an English
 * template literal built at the call site, which meant an Uzbek employee got
 * "Deadline approaching: ..." and nobody could change it without a release.
 *
 * `placeholders` is an allowlist, not documentation. Rendering refuses a
 * placeholder that is not on it, so an editable template can never be turned
 * into a way to read arbitrary fields off the object passed to notify().
 */
const notificationTemplateSchema = new Schema(
  {
    // The notification type it renders — COURSE_ASSIGNED, TASK_OVERDUE.
    // Call sites pass this as `templateKey`; the two are the same string.
    type: { type: String, required: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    lang: { type: String, enum: NOTIFICATION_LANGS, required: true },

    // Title for IN_APP and PUSH, Subject: for EMAIL.
    subject: { type: String, required: true },
    body: { type: String, default: '' },

    placeholders: { type: [String], default: [] },

    // Wording for a placeholder the caller had no value for. A course can be
    // assigned with no deadline, an event with no stated location — without
    // this the text renders "Tugatish muddati: ." Per language, because the
    // fallback is a phrase ("belgilanmagan"), not a value.
    defaults: { type: Map, of: String, default: () => ({}) },

    // Lets an operator silence one type on one channel without deleting the
    // wording — "stop emailing about attention alerts" is a common ask and
    // must not mean retyping the template to turn it back on.
    enabled: { type: Boolean, default: true },

    // False for rows created by the M9 seed, true once someone edits one.
    // The seed can then be re-run after adding a type without overwriting
    // wording a human has since corrected.
    customized: { type: Boolean, default: false },
  },
  { timestamps: true }
)

notificationTemplateSchema.index({ type: 1, channel: 1, lang: 1 }, { unique: true })

export const NotificationTemplate = model('NotificationTemplate', notificationTemplateSchema)
