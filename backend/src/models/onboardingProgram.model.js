import { Schema, model } from 'mongoose'

/**
 * What a new hire's first weeks consist of.
 *
 * A learning path is a sequence of courses. Onboarding is a sequence of
 * *things somebody has to do*, only some of which are courses: read the
 * handbook, meet your mentor, get your access card, attend the induction.
 * Expressing that as a path would mean inventing a course for "collect your
 * laptop", so it is its own model with typed steps.
 *
 * `dueDays` is relative to the start date rather than absolute, because a
 * programme outlives any particular intake: whoever joins in June gets the
 * same fourteen days the January hire got.
 */
const stepSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['COURSE', 'PATH', 'TASK', 'EVENT', 'ASSIGNMENT', 'KB_ARTICLE', 'MANUAL'],
      required: true,
    },
    // Null for MANUAL steps, which are a checkbox and a sentence — "sign the
    // safety declaration" has nothing in the database to point at, and
    // inventing a record for it would be worse than admitting that.
    refId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dueDays: { type: Number, min: 0, default: 7 },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // Who is responsible for it happening. The new hire cannot mark "IT
    // account created" done, and asking them to is how a checklist becomes
    // fiction.
    ownerRole: { type: String, enum: ['EMPLOYEE', 'MANAGER', 'MENTOR', 'HR'], default: 'EMPLOYEE' },
  },
  { _id: true }
)

const onboardingProgramSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Who this programme is for. Same shape as the enrolment rules' match,
    // and used the same way — every field is an OR within itself and an AND
    // across, and an empty array is no constraint on that field.
    targetRoles: { type: [String], default: [] },
    departments: { type: [String], default: [] },
    positions: { type: [String], default: [] },
    branches: { type: [String], default: [] },

    steps: { type: [stepSchema], default: [] },

    // When true, the daily job starts this programme for anybody whose
    // hireDate has arrived and who matches. Off by default: a programme
    // that enrols people the moment it is saved is not something to switch
    // on by accident.
    autoStart: { type: Boolean, default: false },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

onboardingProgramSchema.index({ status: 1, autoStart: 1 })

export const OnboardingProgram = model('OnboardingProgram', onboardingProgramSchema)
