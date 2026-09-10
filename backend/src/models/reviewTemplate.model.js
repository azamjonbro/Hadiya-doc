import { Schema, model } from 'mongoose'

/**
 * Who is being asked, in a 360° review.
 *
 * These four are not a taxonomy somebody invented for this file — they are
 * the only groups derivable from `user.managerId` without a second source of
 * truth, and that is exactly why the derivation can be automatic (13.2):
 *
 *   SELF         the subject
 *   MANAGER      the person the subject reports to
 *   PEER         the other reports of that same manager
 *   SUBORDINATE  the subject's own reports
 *
 * Anything richer (project team-mates, internal customers) needs data the
 * platform does not hold, and inventing a "rater picker" would put the work
 * back on HR — which is the thing 13.2 exists to remove.
 */
export const RATER_GROUPS = Object.freeze(['SELF', 'MANAGER', 'PEER', 'SUBORDINATE'])

/**
 * The groups whose answers are pooled before anybody sees them.
 *
 * SELF is deliberately never in this list: the only person who reads a
 * self-assessment already knows who wrote it, and hiding it from them turns
 * the most useful column of the report into a blank.
 *
 * MANAGER is in it by default, even though most people have exactly one
 * manager and the gate therefore hides that column outright. That is the
 * conservative reading of "anonimlik N≥3" and it fails in the safe
 * direction; a company that wants attributed manager feedback takes MANAGER
 * out of the list on the template, which is a decision somebody makes on
 * purpose rather than one the code makes for them.
 */
export const DEFAULT_ANONYMOUS_GROUPS = Object.freeze(['MANAGER', 'PEER', 'SUBORDINATE'])

const questionSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    // RATING is what the aggregate averages; TEXT is a comment, shown
    // verbatim and only once its group is revealed. A template with only
    // TEXT questions is legitimate — an open-ended review — and the
    // aggregate simply has no numbers in it.
    type: { type: String, enum: ['RATING', 'TEXT'], default: 'RATING' },
    // Optional link to 13.1. When present, a closed cycle can post the
    // resulting level to `userCompetency` with source REVIEW360 instead of
    // the answer dying inside this module.
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', default: null },
    scaleMax: { type: Number, min: 2, max: 10, default: 5 },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // Not every question makes sense for every group — "delegates work
    // well" cannot be answered by a peer who has never been delegated to,
    // and forcing them to guess is how a 360° report fills with noise.
    groups: { type: [String], enum: RATER_GROUPS, default: () => [...RATER_GROUPS] },
  },
  { _id: true }
)

const reviewTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    questions: { type: [questionSchema], default: [] },

    // Which groups are asked at all, and how many people to take from the
    // wide ones. A department of forty peers would otherwise send forty
    // questionnaires per subject, and the response rate collapses.
    raterGroups: { type: [String], enum: RATER_GROUPS, default: () => [...RATER_GROUPS] },
    maxPeers: { type: Number, min: 0, max: 50, default: 10 },
    maxSubordinates: { type: Number, min: 0, max: 50, default: 10 },

    anonymousGroups: { type: [String], enum: RATER_GROUPS, default: () => [...DEFAULT_ANONYMOUS_GROUPS] },
    // N in "N≥3". Configurable but floored at 2 in the validator: a
    // threshold of 1 is not anonymity, it is a label saying so.
    anonymityThreshold: { type: Number, min: 2, max: 20, default: 3 },

    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

reviewTemplateSchema.index({ status: 1, name: 1 })

export const ReviewTemplate = model('ReviewTemplate', reviewTemplateSchema)
