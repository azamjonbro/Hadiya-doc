import { Schema, model } from 'mongoose'

// One entry per user per video (or per assessment) that ever paid out
// points. The unique indexes below are the idempotency guard — a re-watch,
// a quiz retake, or an assessment resubmit can never award points twice for
// the same source. Exactly one of videoId/assessmentId is set, matching
// which `source` produced the row.
const pointsLedgerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', default: null },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', default: null },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    points: { type: Number, required: true },
    source: { type: String, enum: ['COMPLETION', 'QUIZ', 'ASSESSMENT'], required: true },
  },
  { timestamps: true }
)

/**
 * Partial, not sparse.
 *
 * `sparse` on a *compound* index only skips a document when every indexed
 * field is missing. `userId` is always present, so every row was indexed —
 * and because `assessmentId` defaults to null rather than being absent, two
 * video rows for one person both indexed as `{userId, assessmentId: null}`
 * and collided.
 *
 * The effect was silent and total: `pointsService.award` swallows a
 * duplicate-key error as "already paid out", so after their first video
 * every subsequent award for that person returned `{ awarded: false }` and
 * wrote nothing. One video and one assessment, ever, per person.
 *
 * The partial filter indexes only the rows where the field is actually an
 * id, which is what the original comment intended.
 */
pointsLedgerSchema.index(
  { userId: 1, videoId: 1 },
  { unique: true, partialFilterExpression: { videoId: { $type: 'objectId' } } }
)
pointsLedgerSchema.index(
  { userId: 1, assessmentId: 1 },
  { unique: true, partialFilterExpression: { assessmentId: { $type: 'objectId' } } }
)
pointsLedgerSchema.index({ userId: 1 })

export const PointsLedger = model('PointsLedger', pointsLedgerSchema)
