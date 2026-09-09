import { Schema, model } from 'mongoose'

/**
 * "Everybody in this job gets these courses" — as a rule, not as a habit.
 *
 * Today enrolling a new hire is somebody remembering to assign six courses,
 * which means the answer to "has every electrician done the safety course"
 * depends on whether anyone forgot. A rule makes the assignment a
 * consequence of the person's role and department rather than of an
 * administrator's attention.
 *
 * Every field of `match` is an OR within itself and an AND across: roles
 * [ELECTRICIAN, TECHNICIAN] and departments [Maintenance] means an
 * electrician *in* maintenance. An empty array means "no constraint on this
 * field", which is what makes a rule for the whole company expressible.
 */
const matchSchema = new Schema(
  {
    roles: { type: [String], default: [] },
    departments: { type: [String], default: [] },
    branches: { type: [String], default: [] },
    positions: { type: [String], default: [] },
    groups: { type: [{ type: Schema.Types.ObjectId, ref: 'Group' }], default: [] },
  },
  { _id: false }
)

const grantSchema = new Schema(
  {
    courseIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Course' }], default: [] },
    pathIds: { type: [{ type: Schema.Types.ObjectId, ref: 'LearningPath' }], default: [] },
    // Days from the moment the rule grants it, not a fixed date: a rule
    // outlives any particular deadline, and a new hire in June should get
    // the same two weeks the one in January got.
    deadlineDays: { type: Number, min: 0, default: 0 },
    mandatory: { type: Boolean, default: true },
  },
  { _id: false }
)

const enrollmentRuleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Off by default. A rule that assigns courses to hundreds of people the
    // moment it is saved is not something to do by accident, so it is
    // written first and switched on deliberately.
    active: { type: Boolean, default: false },
    match: { type: matchSchema, default: () => ({}) },
    grant: { type: grantSchema, default: () => ({}) },
    lastEvaluatedAt: { type: Date, default: null },
    lastMatchedCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

enrollmentRuleSchema.index({ active: 1 })

export const EnrollmentRule = model('EnrollmentRule', enrollmentRuleSchema)
