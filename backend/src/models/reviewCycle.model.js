import { Schema, model } from 'mongoose'
import { RATER_GROUPS } from './reviewTemplate.model.js'

/**
 * A snapshot of one template question, frozen onto the cycle at launch.
 *
 * The alternative — reading the questions through `templateId` at display
 * time — was rejected because a template is edited between cycles and
 * sometimes *during* one. Reworded question 4 would then retroactively
 * change what the people who already answered were asked, and a scale
 * shortened from 5 to 4 would turn stored 5s into off-scale values. A
 * running cycle has to be a fixed instrument.
 *
 * `_id` is copied from the template question rather than generated, so an
 * answer submitted against the template's question id still resolves and
 * the two halves of the module can be read side by side.
 */
const snapshotQuestionSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    text: { type: String, required: true },
    type: { type: String, enum: ['RATING', 'TEXT'], default: 'RATING' },
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', default: null },
    scaleMax: { type: Number, default: 5 },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    groups: { type: [String], enum: RATER_GROUPS, default: () => [...RATER_GROUPS] },
  },
  { _id: false }
)

const reviewCycleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    templateId: { type: Schema.Types.ObjectId, ref: 'ReviewTemplate', required: true },

    // Whom the cycle is about. Raters are never listed here — they are
    // derived from `managerId` at launch and materialise as assignments.
    subjectIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },

    /**
     * DRAFT    being set up; nothing has been sent, raters can be previewed
     * RUNNING  assignments exist and answers are accepted
     * CLOSED   answers are refused, results are readable, levels posted
     *
     * One-way on purpose. Reopening a closed cycle would let somebody add
     * an answer after seeing the aggregate, which is the one thing that
     * makes a 360° report untrustworthy.
     */
    status: { type: String, enum: ['DRAFT', 'RUNNING', 'CLOSED'], default: 'DRAFT' },

    dueAt: { type: Date, default: null },
    launchedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    // Frozen at launch, for the reason above — and the anonymity settings
    // are frozen with them. Lowering the threshold on the template must not
    // retroactively expose answers that were given under a promise of 3.
    questions: { type: [snapshotQuestionSchema], default: [] },
    anonymousGroups: { type: [String], enum: RATER_GROUPS, default: [] },
    anonymityThreshold: { type: Number, default: 3 },

    // Whether closing the cycle writes the resulting levels into 13.1.
    // Off by default: posting a competency level is an act with
    // consequences for shift assignment and promotion, and it should be a
    // choice made when the cycle is designed.
    postToCompetencies: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

reviewCycleSchema.index({ status: 1, createdAt: -1 })
// "Which cycles is this person a subject of" — asked by the scoped list a
// manager sees and by the subject's own report.
reviewCycleSchema.index({ subjectIds: 1 })

export const ReviewCycle = model('ReviewCycle', reviewCycleSchema)
