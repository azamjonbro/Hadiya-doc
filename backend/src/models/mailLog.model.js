import { Schema, model } from 'mongoose'

export const MAIL_STATUS = ['QUEUED', 'SENT', 'FAILED', 'SKIPPED']

/**
 * One row per outbound email, written before the first send attempt.
 *
 * Delivery is the part of this system nobody can see: a password-reset mail
 * that never arrives looks exactly like a user who mistyped their address.
 * The row is what makes "did it go out, how many times did we try, and what
 * did the server say" answerable after the fact.
 *
 * `to` is stored because that is the whole question being answered; nothing
 * else about the recipient is, and the body never is — a 90-day archive of
 * everything the platform has ever mailed anyone is a liability, not a log.
 */
const mailLogSchema = new Schema(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },
    // Set once templates land (1.2). Until then a caller passes a subject
    // and body directly and this stays null.
    templateKey: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: MAIL_STATUS, default: 'QUEUED', index: true },
    attempts: { type: Number, default: 0 },
    // The SMTP server's own words, trimmed. Kept because "why did it fail"
    // is almost always in there — a bad recipient, a rejected sender, an
    // auth failure — and each needs a different fix.
    error: { type: String, default: null },
    messageId: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// 90 days, per the checklist. Long enough to investigate "I never got the
// mail" from weeks ago, short enough that the collection stays small and
// the addresses do not accumulate forever.
mailLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

// The operational question is always "what is failing lately", never "what
// happened to this one address in general".
mailLogSchema.index({ status: 1, createdAt: -1 })

export const MailLog = model('MailLog', mailLogSchema)
