import { Schema, model } from 'mongoose'

/**
 * Training that has to be redone on a cycle.
 *
 * Fire safety is not learned once. A compliance regime says "every twelve
 * months", and the platform's job is to notice that somebody's twelve
 * months are up — because the alternative is an audit discovering it, which
 * is the expensive way to find out.
 *
 * The audience is the same `match` shape as an enrolment rule (5.3) and a
 * dynamic group (5.5), read the same way: OR within a field, AND across,
 * an empty array meaning no constraint on that field. Three copies of that
 * idea would be three chances to disagree about what an empty array means,
 * so they share the reading even where they cannot share the schema.
 */
const matchSchema = new Schema(
  {
    roles: { type: [String], default: [] },
    departments: { type: [String], default: [] },
    branches: { type: [String], default: [] },
    positions: { type: [String], default: [] },
  },
  { _id: false }
)

const recurringAssignmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },

    match: { type: matchSchema, default: () => ({}) },

    // How long a completion counts for. The cycle is per person, measured
    // from *their* completion, not from a shared calendar date — somebody
    // who finished in March is due in March, not on the company's January
    // sweep.
    intervalMonths: { type: Number, min: 1, max: 120, required: true },
    // How long they get once it comes due.
    dueDays: { type: Number, min: 1, max: 365, default: 30 },

    active: { type: Boolean, default: false },

    // When the sweep should next look at this rule at all. Distinct from
    // any individual's due date: the rule is checked daily, the people
    // under it come due on their own anniversaries.
    nextRunAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

recurringAssignmentSchema.index({ active: 1, nextRunAt: 1 })
recurringAssignmentSchema.index({ courseId: 1 })

export const RecurringAssignment = model('RecurringAssignment', recurringAssignmentSchema)
