import { Schema, model } from 'mongoose'

const answerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    answer: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
)

// Answers are embedded rather than a separate collection — Q&A threads on
// one course are small (dozens, not thousands), so there's no pagination
// or indexing need that would justify a join.
const courseQuestionSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: String, required: true, trim: true },
    answers: { type: [answerSchema], default: [] },
  },
  { timestamps: true }
)

courseQuestionSchema.index({ courseId: 1, createdAt: -1 })

export const CourseQuestion = model('CourseQuestion', courseQuestionSchema)
