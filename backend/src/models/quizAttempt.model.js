import { Schema, model } from 'mongoose'

const answerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    selectedOptionIndex: { type: Number, required: true },
  },
  { _id: false }
)

const quizAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    answers: { type: [answerSchema], default: [] },
    scorePercent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    pointsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
)

quizAttemptSchema.index({ userId: 1, videoId: 1, createdAt: -1 })

export const QuizAttempt = model('QuizAttempt', quizAttemptSchema)
