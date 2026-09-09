import { Schema, model } from 'mongoose'

const answerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    // See quizAttempt.model.js: optional now, because only one of the
    // fourteen question types answers with an option index.
    selectedOptionIndex: { type: Number, default: null },
    payload: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
)

// Mirrors quizAttempt.model.js's shape, deliberately with no videoId field
// at all — an Assessment is never tied to a video.
const assessmentAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    // The unified test this attempt belongs to, once M1 has migrated the
    // assessment. Null on rows written before it.
    testQuizId: { type: Schema.Types.ObjectId, ref: 'TestQuiz', default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: 'TestSession', default: null },
    attemptNo: { type: Number, default: 1 },
    answers: { type: [answerSchema], default: [] },
    perQuestion: {
      type: [
        new Schema(
          {
            questionId: { type: Schema.Types.ObjectId, required: true },
            awarded: { type: Number, default: 0 },
            max: { type: Number, default: 0 },
            correct: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    needsReview: { type: Boolean, default: false },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
    scorePercent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    pointsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
)

assessmentAttemptSchema.index({ userId: 1, assessmentId: 1, createdAt: -1 })

export const AssessmentAttempt = model('AssessmentAttempt', assessmentAttemptSchema)
