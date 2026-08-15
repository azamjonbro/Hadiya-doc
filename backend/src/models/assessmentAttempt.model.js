import { Schema, model } from 'mongoose'

const answerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    selectedOptionIndex: { type: Number, required: true },
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
    answers: { type: [answerSchema], default: [] },
    scorePercent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    pointsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
)

assessmentAttemptSchema.index({ userId: 1, assessmentId: 1, createdAt: -1 })

export const AssessmentAttempt = model('AssessmentAttempt', assessmentAttemptSchema)
