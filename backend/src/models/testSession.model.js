import { Schema, model } from 'mongoose'

/**
 * One live sitting of a test — `assessmentSessions` generalised.
 *
 * The reason it exists is unchanged: a countdown that lives in the browser
 * is reset by a reload, and a `visibilitychange` handler is removed from the
 * devtools console in a second. So the deadline is stamped here at start,
 * submissions are checked against it, and focus losses are counted on the
 * server. A session is separate from the attempt because the attempt is the
 * *result* and only exists once the sitting ends.
 *
 * What is new is `questionSet` and `seed`: with pools and shuffling, the
 * paper is generated per sitting, so it has to be *recorded* per sitting.
 * Without that, a reload would redraw a different set of questions — and
 * grading a submission would have nothing to grade it against, because the
 * quiz no longer says which questions this person was actually asked.
 */

const questionSetEntrySchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    // The order this learner's options were shown in, when shuffling is on.
    // Stored rather than re-derived: the answer comes back as an option id,
    // and the review screen has to redraw the paper exactly as it was sat.
    optionOrder: { type: [String], default: [] },
  },
  { _id: false }
)

const testSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'TestQuiz', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },

    startedAt: { type: Date, required: true },
    // Stamped once, at start. Never recomputed from "now", so reloading the
    // page resumes the same countdown instead of restarting it.
    expiresAt: { type: Date, default: null },

    focusLossCount: { type: Number, default: 0 },

    status: { type: String, enum: ['IN_PROGRESS', 'SUBMITTED', 'TERMINATED'], default: 'IN_PROGRESS' },
    endedReason: {
      type: String,
      enum: ['', 'TIME_EXPIRED', 'FOCUS_LOST', 'ABANDONED'],
      default: '',
    },
    endedAt: { type: Date, default: null },

    questionSet: { type: [questionSetEntrySchema], default: [] },
    // The draw is reproducible from this, which is what lets a support
    // question ("why did she get these five?") be answered a month later.
    seed: { type: String, default: '' },

    // Set by M5 for sessions carried over from `assessmentSessions`, so a
    // re-run repairs instead of duplicating.
    legacyId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
)

// The "is this user already sitting this test?" lookup, on every start.
testSessionSchema.index({ userId: 1, quizId: 1, status: 1 })
testSessionSchema.index(
  { legacyId: 1 },
  { unique: true, partialFilterExpression: { legacyId: { $type: 'objectId' } } }
)

export const TestSession = model('TestSession', testSessionSchema)
