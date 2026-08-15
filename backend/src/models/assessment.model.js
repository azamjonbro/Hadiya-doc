import { Schema, model } from 'mongoose'

// Same option/question shape as quiz.model.js, deliberately duplicated
// rather than shared — Assessment is a standalone topic-level test, not a
// video-bound quiz (see quiz.service.js's video-completion gate and
// video-sourced points, which don't apply here).
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

// Many per topic (unlike Quiz, which is 1:1 with a Video) — a topic can
// hold zero, one, or several standalone tests alongside its other content.
// Unlike Quiz, which borrows title/status/order/points from its parent
// Video, Assessment has no parent content item to borrow from, so it
// carries all of these itself.
const assessmentSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    passScorePercent: { type: Number, default: 70 },
    pointsEnabled: { type: Boolean, default: false },
    points: { type: Number, default: 10 },
    questions: { type: [questionSchema], default: [] },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

assessmentSchema.index({ topicId: 1, order: 1 })

export const Assessment = model('Assessment', assessmentSchema)
