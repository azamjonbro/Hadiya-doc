import { Schema, model } from 'mongoose'

const courseAssignmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    mandatory: { type: Boolean, default: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Set when the enrolment came from a group rather than a one-off
    // assignment. Detaching a course from a group (or removing a member)
    // only revokes rows carrying that group's id, so an assignment a manager
    // made by hand is never swept away by a group edit.
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    assignedAt: { type: Date, default: Date.now },
    startAt: { type: Date, default: null },
    deadline: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    // Dedup markers for the scheduled reminder job — set once so the same
    // assignment never generates the same reminder twice.
    deadlineReminderSentAt: { type: Date, default: null },
    expiryReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

courseAssignmentSchema.index({ userId: 1, courseId: 1 }, { unique: true })
courseAssignmentSchema.index({ deadline: 1, status: 1 })
courseAssignmentSchema.index({ groupId: 1 })

export const CourseAssignment = model('CourseAssignment', courseAssignmentSchema)
