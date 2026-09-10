import { Schema, model } from 'mongoose'

/**
 * What the reviewer said about one goal at review time.
 *
 * The progress figure is copied in rather than looked up later, because the
 * whole value of a review is that it is a statement about a moment. Reading
 * it back through the live course progress would make last quarter's review
 * silently agree with this quarter's numbers.
 */
const goalCommentSchema = new Schema(
  {
    goalId: { type: Schema.Types.ObjectId, required: true },
    comment: { type: String, default: '' },
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: ['PLANNED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED'], default: 'PLANNED' },
  },
  { _id: false }
)

const planReviewSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'DevelopmentPlan', required: true },
    // Denormalised so "every review of this person, across plans" is one
    // query — that list is the substance of a promotion case, and it must
    // not need a join through plans the person no longer has.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    /**
     * Which edition of the plan was read. Together with the unique index
     * below this is the lock: a version can be approved exactly once, and a
     * second approval of the same text is a duplicate-key error rather than
     * a second opinion.
     */
    planVersion: { type: Number, required: true, min: 1 },

    period: { type: String, default: '', trim: true },
    decision: { type: String, enum: ['APPROVED', 'CHANGES_REQUESTED'], required: true },
    // 1–5, or null when the reviewer only left words. Forcing a number would
    // get one typed without meaning.
    overallRating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, default: '' },
    goalComments: { type: [goalCommentSchema], default: [] },

    /**
     * The goals exactly as they read when approved.
     *
     * `Mixed`, and on purpose: this is evidence, not a working document. If
     * the goal schema gains a field next quarter, an old snapshot must keep
     * showing what was actually on the page — a typed subdocument would
     * quietly grow defaults the reviewer never saw.
     */
    snapshot: { type: [Schema.Types.Mixed], default: [] },
    // Overall completion at the moment of the review, so a trend across
    // reviews can be drawn without recomputing history.
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },

    // CPE credits this review handed out, for the report that has to say
    // where a year's credits came from.
    cpeCreditsAwarded: { type: Number, min: 0, default: 0 },

    reviewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

/**
 * One approval per edition — the lock itself.
 *
 * Partial, not sparse, for the reason pointsLedger.model.js documents at
 * length: a compound sparse index only skips a document when every indexed
 * field is missing, and `planId` is always there. CHANGES_REQUESTED is left
 * out of the filter deliberately: asking twice for changes to the same
 * draft is a normal thing to do.
 */
planReviewSchema.index(
  { planId: 1, planVersion: 1 },
  { unique: true, partialFilterExpression: { decision: 'APPROVED' } }
)
planReviewSchema.index({ userId: 1, reviewedAt: -1 })

export const PlanReview = model('PlanReview', planReviewSchema)
