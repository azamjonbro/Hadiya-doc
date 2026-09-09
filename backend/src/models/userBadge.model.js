import { Schema, model } from 'mongoose'

/**
 * A badge somebody has earned, and when.
 *
 * The "when" is the reason this collection exists. Recomputing badges from
 * ledger totals on every read tells you what somebody holds now and nothing
 * about the moment they earned it — so it cannot be announced, cannot be
 * shown on a timeline, and silently disappears if the underlying total ever
 * drops.
 *
 * Awarding is one-way. A badge is a record that something happened, not a
 * status that reflects the present, so a points correction does not take it
 * back.
 */
const userBadgeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    badgeId: { type: Schema.Types.ObjectId, ref: 'Badge', required: true },
    // Denormalised so a badge list renders without a join, and so a badge
    // deleted from the catalog still shows what it was.
    code: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
    // What the metric stood at when it was earned — useful on the profile
    // ("500 points, reached in March") and impossible to reconstruct later.
    snapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

// One award per badge per person. The uniqueness is what makes the award
// idempotent under a retrying evaluation, rather than a check-then-write
// two calls can both pass.
userBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true })
userBadgeSchema.index({ userId: 1, earnedAt: -1 })

export const UserBadge = model('UserBadge', userBadgeSchema)
