import { Schema, model } from 'mongoose'

/**
 * A kind of development plan (rasn 14): a name, a description, and the
 * outcomes a plan of this kind can end with — "goals achieved" /
 * "not achieved" for an individual plan, "completed" / "not completed"
 * for an adaptation plan. Two are seeded and locked (`isSystem`); the
 * rest are the company's own.
 */
const outcomeSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    positive: { type: Boolean, default: true },
  },
  { _id: false }
)

const developmentPlanTypeSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    outcomes: { type: [outcomeSchema], default: [] },
    status: { type: String, enum: ['PUBLISHED', 'HIDDEN'], default: 'PUBLISHED' },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export const DevelopmentPlanType = model('DevelopmentPlanType', developmentPlanTypeSchema)
