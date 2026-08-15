import { Schema, model } from 'mongoose'

const optionSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: true }
)

const questionSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    options: { type: [optionSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: true }
)

// One quiz per video, embedded questions/options — same reasoning as
// CourseQuestion's embedded answers: a handful of questions per video,
// never large enough to justify a join or pagination.
const quizSchema = new Schema(
  {
    videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true, unique: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    passScorePercent: { type: Number, default: 70 },
    questions: { type: [questionSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export const Quiz = model('Quiz', quizSchema)
