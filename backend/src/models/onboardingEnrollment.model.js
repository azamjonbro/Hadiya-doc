import { Schema, model } from 'mongoose'

/**
 * One new hire's run through one programme.
 *
 * `stepStates` carries a due date per step, computed once from the start
 * date. Recomputing it on read would move every deadline whenever the
 * programme was edited, including for people who finished months ago.
 */
const stepStateSchema = new Schema(
  {
    stepId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'], default: 'PENDING' },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    // Who ticked it. A step owned by HR that the new hire marked done is a
    // different fact from one HR marked done, and the difference is the
    // whole point of having owners.
    completedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // For TASK steps: the Task document the fan-out created, so the step and
    // the task the person actually sees stay connected.
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { _id: false }
)

const onboardingEnrollmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    programId: { type: Schema.Types.ObjectId, ref: 'OnboardingProgram', required: true },
    mentorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Copied at start rather than read from the user each time: the person
    // who owns a new hire's onboarding is the manager they had on day one,
    // and a reorganisation in week three must not orphan the checklist.
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    startedAt: { type: Date, default: Date.now },
    dueAt: { type: Date, default: null },

    stepStates: { type: [stepStateSchema], default: [] },
    completionPercent: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// One run per person per programme. A second row would give one new hire
// two different checklists.
onboardingEnrollmentSchema.index({ userId: 1, programId: 1 }, { unique: true })
onboardingEnrollmentSchema.index({ status: 1, dueAt: 1 })

export const OnboardingEnrollment = model('OnboardingEnrollment', onboardingEnrollmentSchema)
