import { Schema, model } from 'mongoose'

// One entry per user per video (or per assessment) that ever paid out
// points. The sparse unique indexes below are the idempotency guard — a
// re-watch, a quiz retake, or an assessment resubmit can never award points
// twice for the same source. Exactly one of videoId/assessmentId is set,
// matching which `source` produced the row.
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

pointsLedgerSchema.index({ userId: 1, videoId: 1 }, { unique: true, sparse: true })
pointsLedgerSchema.index({ userId: 1, assessmentId: 1 }, { unique: true, sparse: true })
pointsLedgerSchema.index({ userId: 1 })

export const PointsLedger = model('PointsLedger', pointsLedgerSchema)
