import { Schema, model } from 'mongoose'

/**
 * What somebody has to be *seen doing* before they are signed off (13.3).
 *
 * A quiz answers "do they know it"; on-the-job training answers "can they
 * do it, in front of a witness, on the machine". Those are different
 * claims, and the second one is the one a safety officer is asked for.
 *
 * `version` is the whole reason this is not just an array of strings. A
 * checklist is a live document — a step is reworded, a new one is added
 * after an incident — and a session that finished in March was against
 * March's list. Sessions therefore carry a **copy** of the items they were
 * run with (see ojtSession.model.js) plus the version number that copy came
 * from, so an edit here can never rewrite what an observer already signed.
 */
const checklistItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // What "good" looks like for this step. Written for the observer
    // standing next to the trainee, not for the person who designed the
    // list — "hands stay outside the guard at all times", not "safety".
    criteria: { type: String, default: '' },
    order: { type: Number, default: 0 },

    // A required item that fails, fails the session however good the rest
    // was. That is the difference between "mostly competent" and "did not
    // isolate the power before opening the panel".
    required: { type: Boolean, default: true },
    // Relative worth inside the percentage. Default 1 so a list nobody
    // weighted scores as a plain proportion of items.
    weight: { type: Number, min: 0, default: 1 },

    // Optional link to the competency catalogue (13.1). When the session is
    // signed off, a passed item posts `competencyLevel` to the trainee's
    // holding with source OJT — which is how "watched them do it" becomes a
    // level on the skill matrix rather than a note in a drawer.
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', default: null },
    competencyLevel: { type: Number, min: 0, default: null },

    // How the item is judged: a rating scale (ojtScale.model.js), or the
    // plain yes/no when null.
    scaleId: { type: Schema.Types.ObjectId, ref: 'OjtScale', default: null },
  },
  { _id: true }
)

const ojtChecklistSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Free text, matching `user.position` — there is no positions table to
    // reference (see competency.model.js for the same reasoning).
    position: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },

    items: { type: [checklistItemSchema], default: [] },

    // The percentage of observed weight that has to pass. Every required
    // item must pass on top of this — the threshold is a floor on the
    // optional part, not a way to buy out of a mandatory step.
    passThresholdPercent: { type: Number, min: 0, max: 100, default: 80 },

    // Bumped by the service whenever the items change. Sessions record the
    // version they copied, so "which list was this run against" is
    // answerable years later.
    version: { type: Number, min: 1, default: 1 },

    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

ojtChecklistSchema.index({ status: 1, name: 1 })

export const OjtChecklist = model('OjtChecklist', ojtChecklistSchema)
