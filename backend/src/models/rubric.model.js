import { Schema, model } from 'mongoose'

/**
 * A marking scheme: the criteria a submission is judged on.
 *
 * Without one, "8 out of 10" is a number the learner cannot argue with or
 * learn from. With one, the same 8 is four criteria with a level chosen on
 * each, which is a conversation.
 *
 * `levels` are the named points on each criterion ("не выполнено /
 * частично / полностью") rather than a free number, because two reviewers
 * given a free number score the same work differently and neither can say
 * why.
 */
const criterionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    maxScore: { type: Number, min: 0, required: true },
    levels: {
      type: [
        new Schema(
          {
            label: { type: String, required: true, trim: true },
            score: { type: Number, min: 0, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: true }
)

const rubricSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    criteria: { type: [criterionSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export const Rubric = model('Rubric', rubricSchema)
