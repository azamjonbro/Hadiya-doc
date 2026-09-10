import { Schema, model } from 'mongoose'
import { RATER_GROUPS } from './reviewTemplate.model.js'

const answerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    // A RATING answer fills `rating`; a TEXT answer fills `text`. Both are
    // optional at the schema level because an optional question may simply
    // be skipped, and the service — which knows the cycle's snapshot — is
    // where "required means answered" is enforced.
    rating: { type: Number, min: 0, max: 10, default: null },
    text: { type: String, default: '' },
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', default: null },
  },
  { _id: false }
)

/**
 * What somebody said. Deliberately missing: who they are.
 *
 * `raterGroup` is copied here at submission so the aggregate can be built
 * from this collection alone — no lookup into `reviewAssignment`, which is
 * the collection that knows the names. That is what makes the anonymity
 * gate a property of the query rather than a discipline the next author has
 * to remember.
 *
 * A response is immutable once written. There is no `updatedBy`, no edit
 * endpoint and a unique index that refuses a second row for the same
 * assignment: the value of a 360° answer is that it was given before the
 * subject could react to it.
 */
const reviewResponseSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'ReviewAssignment', required: true, unique: true },
    cycleId: { type: Schema.Types.ObjectId, ref: 'ReviewCycle', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raterGroup: { type: String, enum: RATER_GROUPS, required: true },

    answers: { type: [answerSchema], default: [] },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// The aggregate reads exactly this way: everything about one subject in one
// cycle, grouped by rater group.
reviewResponseSchema.index({ cycleId: 1, subjectId: 1, raterGroup: 1 })

export const ReviewResponse = model('ReviewResponse', reviewResponseSchema)
