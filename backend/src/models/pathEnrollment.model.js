import { Schema, model } from 'mongoose'

/**
 * One person's run through one path.
 *
 * `itemStates` is a copy of where they stand on each item, not the source
 * of truth — that stays with the course assignment, the event registration
 * and so on. It is here because the path's percentage has to be answerable
 * without fanning out across four collections on every page render, and
 * because a path completed in March must keep saying so even if a course in
 * it is later retired.
 */
const itemStateSchema = new Schema(
  {
    refId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['COURSE', 'EVENT', 'ASSIGNMENT', 'PATH'], default: 'COURSE' },
    status: { type: String, enum: ['LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED'], default: 'LOCKED' },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
)

const pathEnrollmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pathId: { type: Schema.Types.ObjectId, ref: 'LearningPath', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    mandatory: { type: Boolean, default: true },

    startAt: { type: Date, default: null },
    deadline: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
      default: 'ACTIVE',
    },

    itemStates: { type: [itemStateSchema], default: [] },
    completionPercent: { type: Number, min: 0, max: 100, default: 0 },
    completedAt: { type: Date, default: null },

    // Stamped when the deadline reminder goes out, so the daily job does not
    // send it again every morning until the deadline passes.
    deadlineReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// One enrolment per person per path. Re-assigning is an update, not a
// second row — two rows would give one learner two different percentages
// for the same programme.
pathEnrollmentSchema.index({ userId: 1, pathId: 1 }, { unique: true })
pathEnrollmentSchema.index({ deadline: 1, status: 1 })

export const PathEnrollment = model('PathEnrollment', pathEnrollmentSchema)
