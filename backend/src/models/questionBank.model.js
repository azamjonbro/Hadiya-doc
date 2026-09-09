import { Schema, model } from 'mongoose'

/**
 * A collection of questions that quizzes draw from.
 *
 * The point of a bank is reuse: the same twenty safety questions feed the
 * onboarding test, the annual refresher and the random pool a supervisor
 * generates, and editing the wording of one question has to fix all three.
 * Today's questions are embedded in each quiz, so the same question exists
 * as three unrelated copies and fixing it means finding all three.
 *
 * `courseId` null means the bank is global — shared across the platform.
 * Scoped to a course it stays with that course's authors, which is what
 * stops a general bank filling up with one course's throwaway questions.
 */
const questionBankSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    tags: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

questionBankSchema.index({ courseId: 1 })
questionBankSchema.index({ tags: 1 })

export const QuestionBank = model('QuestionBank', questionBankSchema)
