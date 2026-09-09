import { Schema, model } from 'mongoose'

/**
 * One attempt at one piece of homework.
 *
 * A row per attempt rather than a mutable current answer, because the
 * history is the point: a reviewer returning work and a learner fixing it
 * is the normal cycle, and overwriting the first attempt loses both what
 * was wrong and the fact that it was corrected.
 *
 * DRAFT exists so somebody can write half an essay and come back. It is
 * invisible to reviewers — a draft in the grading queue would be work
 * marked before it was finished.
 */
const fileSchema = new Schema(
  {
    // Key in the private materials bucket, never a client-supplied path.
    key: { type: String, required: true },
    name: { type: String, default: '' },
    size: { type: Number, default: 0 },
    mime: { type: String, default: '' },
  },
  { _id: false }
)

const rubricScoreSchema = new Schema(
  {
    criterionId: { type: Schema.Types.ObjectId, required: true },
    score: { type: Number, min: 0, default: 0 },
    comment: { type: String, default: '' },
  },
  { _id: false }
)

const submissionSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attemptNo: { type: Number, min: 1, default: 1 },

    text: { type: String, default: '' },
    files: { type: [fileSchema], default: [] },
    links: { type: [String], default: [] },

    submittedAt: { type: Date, default: null },
    // Stamped at submission time by comparing with the assignment's due
    // date, not recomputed on read: an assignment whose deadline is later
    // extended must not retroactively un-late somebody's work, and one
    // shortened must not make a punctual submission late.
    late: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'GRADED', 'RETURNED'],
      default: 'DRAFT',
    },

    score: { type: Number, default: null },
    feedback: { type: String, default: '' },
    rubricScores: { type: [rubricScoreSchema], default: [] },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// One row per attempt per person. The uniqueness is what makes the attempt
// number the referee when two tabs submit at once — the same trick the quiz
// attempt limit uses (AT-06).
submissionSchema.index({ assignmentId: 1, userId: 1, attemptNo: 1 }, { unique: true })
// The grading queue: everything submitted and not yet marked, oldest first.
submissionSchema.index({ status: 1, submittedAt: 1 })
submissionSchema.index({ userId: 1, assignmentId: 1 })

export const Submission = model('Submission', submissionSchema)
