import { Schema, model } from 'mongoose'

const answerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    // The legacy answer: an index into the question's embedded options.
    // Optional now rather than required, because it can only express "pick
    // one of these" — the other twelve question types answer in `payload`.
    // Existing rows are untouched and still read exactly as before.
    selectedOptionIndex: { type: Number, default: null },
    // The typed answer, shaped by the question's type (questionGrading.js).
    payload: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
)

// What each question was worth and what it earned. Recorded at grading time
// rather than recomputed on read: a question edited later must not silently
// change a score somebody was already told (spec §6.3 `perQuestion[]`).
const perQuestionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    awarded: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
)

const quizAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    // Optional from here on: a TOPIC- or COURSE-scoped test has no video.
    // Every existing row has one, and nothing about them changes.
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', default: null },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    // The unified test this attempt belongs to, once the quiz has been
    // migrated. Null on rows written before M1 — `quizId` still points at
    // the legacy quiz, which is what keeps the old endpoints answering.
    testQuizId: { type: Schema.Types.ObjectId, ref: 'TestQuiz', default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: 'TestSession', default: null },
    // 1-based, per user per test. Needed to enforce maxAttempts without a
    // count query racing itself, and to say "attempt 2 of 3" on the review
    // screen. Backfilled by M5 from the existing rows' order.
    attemptNo: { type: Number, default: 1 },
    answers: { type: [answerSchema], default: [] },
    perQuestion: { type: [perQuestionSchema], default: [] },
    scorePercent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    pointsAwarded: { type: Number, default: 0 },
    // An attempt containing an essay is scored but not final until somebody
    // reads it.
    needsReview: { type: Boolean, default: false },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

quizAttemptSchema.index({ userId: 1, videoId: 1, createdAt: -1 })
quizAttemptSchema.index({ userId: 1, testQuizId: 1, createdAt: -1 })

/**
 * The attempt limit, enforced by the database (AT-06).
 *
 * Two browser tabs submitting at the same moment both count the existing
 * attempts, both get the same answer, and both decide they are allowed one
 * more. No amount of checking first fixes that — the check and the insert
 * are two operations. A unique index makes the *insert* the decision: one
 * of them writes attempt 2, the other gets a duplicate-key error and is
 * turned away with 409.
 *
 * Partial on `testQuizId`, so the legacy rows — which have none and were
 * never numbered per test — are not dragged into it.
 */
quizAttemptSchema.index(
  { userId: 1, testQuizId: 1, attemptNo: 1 },
  { unique: true, partialFilterExpression: { testQuizId: { $type: 'objectId' } } }
)

export const QuizAttempt = model('QuizAttempt', quizAttemptSchema)
