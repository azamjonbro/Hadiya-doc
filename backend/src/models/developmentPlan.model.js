import { Schema, model } from 'mongoose'

/** What a goal points at. The kind decides where its progress comes from. */
export const GOAL_TYPES = Object.freeze(['COURSE', 'COMPETENCY', 'OJT', 'CUSTOM'])

/** Kinds whose progress is read out of the platform, never typed by hand. */
export const DERIVED_GOAL_TYPES = Object.freeze(['COURSE', 'COMPETENCY'])

/**
 * One line of a person's development plan.
 *
 * The type is not decoration: it decides who is allowed to say the goal
 * moved. A COURSE goal is as done as the learner's own course progress says
 * it is, and a COMPETENCY goal is as done as the level somebody assessed —
 * both read through to the real record on every read. Only OJT and CUSTOM
 * carry a typed number, because nothing in the database backs them yet.
 *
 * That asymmetry is the point. A plan whose percentages a manager types is
 * a plan that says whatever the manager wishes it said, and the first
 * quarter-end review turns it into a negotiation about numbers rather than
 * about work. Where the platform already knows the answer, it answers.
 */
const goalSchema = new Schema(
  {
    type: { type: String, enum: GOAL_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },

    // Exactly one of these is set, matching `type`. Enforced in the
    // validator rather than here so the message can say which one is
    // missing — a Mongoose ValidationError names a path, not a reason.
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', default: null },
    // The level this goal is trying to reach. Falls back to whatever the
    // competency requires of this person's job when left empty, so "close
    // the gap" needs no number typed at all.
    targetLevel: { type: Number, min: 0, max: 10, default: null },
    // The level the person held when the goal was written. Progress is the
    // climb from here to `targetLevel`, not the height above zero — asked
    // to go from 2 to 4 and still at 2, somebody has done none of this goal,
    // and showing them 50% for standing still is how a plan stops being read.
    baseLevel: { type: Number, min: 0, max: 10, default: 0 },

    /**
     * A seam, deliberately loose: the OJT checklist (13.3) is being built
     * beside this and its collection name is not settled. Stored as a plain
     * string id with no `ref`, so nothing here has to be edited when that
     * model lands — only the progress reader gains a branch.
     */
    ojtChecklistId: { type: String, default: null },

    targetDate: { type: Date, default: null },
    // How much this goal counts toward the plan's overall figure. A
    // certification worth a quarter of somebody's year should not weigh the
    // same as a book to read.
    weight: { type: Number, min: 1, max: 10, default: 1 },

    status: { type: String, enum: ['PLANNED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED'], default: 'PLANNED' },

    // Only ever read for OJT and CUSTOM goals. Left at 0 on derived kinds so
    // a stale copy can never be mistaken for the answer.
    manualProgress: { type: Number, min: 0, max: 100, default: 0 },
    achievedAt: { type: Date, default: null },

    /**
     * Continuing professional education credits this goal is worth.
     *
     * `cpeCreditedAt` is the idempotency guard, and it is claimed with a
     * conditional update before the ledger row is written (see
     * developmentPlan.service.js). It lives here rather than in the ledger
     * because PointsLedger's unique indexes only cover rows carrying a
     * videoId or an assessmentId — a plan row carries neither, so the
     * database would happily accept the same credit twice.
     */
    cpeCredits: { type: Number, min: 0, max: 1000, default: 0 },
    cpeCreditedAt: { type: Date, default: null },
  },
  { _id: true, timestamps: false }
)

const developmentPlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied at creation, not joined through the user, for the same reason
    // an onboarding enrolment copies it: the person who owns this plan is
    // the manager who agreed it, and a reorganisation mid-cycle must not
    // orphan a review that is half done.
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'REVIEWED', 'COMPLETED', 'ARCHIVED'],
      default: 'DRAFT',
    },

    goals: { type: [goalSchema], default: [] },

    /**
     * The edition of the plan. A review freezes the number it reviewed
     * (`PlanReview.planVersion`, unique per plan) and any structural change
     * afterwards bumps it.
     *
     * Without this, "approved on 3 March" means nothing: the goals it
     * approved could be rewritten the next day and the approval would still
     * sit there, apparently endorsing text nobody read. The version is what
     * makes an approval refer to something.
     */
    version: { type: Number, default: 1, min: 1 },
    lockedVersion: { type: Number, default: null },
    lastReviewAt: { type: Date, default: null },

    // Where the plan came from (rasn 13's "Назначения" count on a
    // template) and what kind it is (rasn 14). Both optional: a plan
    // written by hand has neither.
    templateId: { type: Schema.Types.ObjectId, ref: 'DevelopmentPlanTemplate', default: null },
    typeId: { type: Schema.Types.ObjectId, ref: 'DevelopmentPlanType', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

// "My plans, newest first" and "this manager's people" are the only two ways
// this collection is ever read.
developmentPlanSchema.index({ userId: 1, periodStart: -1 })
developmentPlanSchema.index({ managerId: 1, status: 1 })

export const DevelopmentPlan = model('DevelopmentPlan', developmentPlanSchema)
