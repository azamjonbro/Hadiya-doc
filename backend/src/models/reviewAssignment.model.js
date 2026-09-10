import { Schema, model } from 'mongoose'
import { RATER_GROUPS } from './reviewTemplate.model.js'

/**
 * One questionnaire: this rater, about this subject, in this cycle.
 *
 * This is the only place the identity of a rater is kept. The answers live
 * in `reviewResponse` and carry the *group* but never the person, so the
 * aggregate that gets rendered is built from a collection that does not
 * contain a name to leak. The link still exists through `assignmentId`, and
 * pretending otherwise would be theatre — but every read path in the
 * results direction stops here, and a query that would cross it is visible
 * as a join somebody had to write on purpose.
 */
const reviewAssignmentSchema = new Schema(
  {
    cycleId: { type: Schema.Types.ObjectId, ref: 'ReviewCycle', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raterGroup: { type: String, enum: RATER_GROUPS, required: true },

    status: { type: String, enum: ['PENDING', 'SUBMITTED', 'DECLINED'], default: 'PENDING' },
    submittedAt: { type: Date, default: null },
    declineReason: { type: String, default: '' },
  },
  { timestamps: true }
)

// One person is asked about one subject once per cycle. Unique rather than
// "we check first": launching twice, or a retry after a timeout, would
// otherwise double every questionnaire and double-count every rating.
reviewAssignmentSchema.index({ cycleId: 1, subjectId: 1, raterId: 1 }, { unique: true })
// The learner's inbox — "what is waiting for me" — is the highest-traffic
// read in the module.
reviewAssignmentSchema.index({ raterId: 1, status: 1 })
reviewAssignmentSchema.index({ cycleId: 1, subjectId: 1, raterGroup: 1 })

export const ReviewAssignment = model('ReviewAssignment', reviewAssignmentSchema)
