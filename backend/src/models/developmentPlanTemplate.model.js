import { Schema, model } from 'mongoose'
import { GOAL_TYPES } from './developmentPlan.model.js'

/**
 * A plan written once and handed out many times (rasn 13): the goals
 * without a person, a type, a cover. Assigning it copies the goals into a
 * real DevelopmentPlan — the template is a source, never a live link, so
 * editing it later does not rewrite plans people are already working on.
 */
const templateGoalSchema = new Schema(
  {
    type: { type: String, enum: GOAL_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', default: null },
    targetLevel: { type: Number, min: 0, max: 10, default: null },
    ojtChecklistId: { type: String, default: null },
    // Days from the plan's start, since a template has no dates of its own.
    dueInDays: { type: Number, min: 0, max: 3650, default: null },
    weight: { type: Number, min: 1, max: 10, default: 1 },
    cpeCredits: { type: Number, min: 0, max: 1000, default: 0 },
  },
  { _id: false }
)

const developmentPlanTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    typeId: { type: Schema.Types.ObjectId, ref: 'DevelopmentPlanType', required: true },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    cover: { type: String, default: '' },
    // Default length of a plan made from it, in days.
    durationDays: { type: Number, min: 1, max: 3650, default: 90 },
    goals: { type: [templateGoalSchema], default: [] },
    status: { type: String, enum: ['PUBLISHED', 'HIDDEN'], default: 'PUBLISHED' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

developmentPlanTemplateSchema.index({ updatedAt: -1 })

export const DevelopmentPlanTemplate = model('DevelopmentPlanTemplate', developmentPlanTemplateSchema)
