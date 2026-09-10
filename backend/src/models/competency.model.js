import { Schema, model } from 'mongoose'

/**
 * One thing a person is expected to be able to do — "Sotuvda e'tirozlar
 * bilan ishlash", "Yuk ko'targich guvohnomasi", "Excel: umumlashtiruvchi
 * jadvallar".
 *
 * A course answers "what did they take"; a competency answers "what can
 * they do", and those are not the same claim. Somebody can sit through six
 * hours of safety video and still not be signed off to work at height,
 * and today the platform has no place to write that down — which is why
 * the parity matrix scores this whole area 0.
 *
 * The scale is **per competency** rather than one company-wide 1–5. A
 * forklift licence has two honest states (held / not held) and a
 * negotiation skill has four or five; forcing both onto the same ruler
 * makes one of them a lie. Levels must still be consecutive integers
 * starting at 1 (enforced in the validator), because everything built on
 * top of this — gap = required − current, "below the bar" reports, the
 * before/after comparison — is arithmetic on that number.
 */
const levelSchema = new Schema(
  {
    value: { type: Number, min: 1, max: 10, required: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
  },
  { _id: false }
)

/**
 * "Whoever is a Sotuvchi needs this at level 3."
 *
 * The requirement lives on the competency rather than in a separate job
 * profile collection. A profile is the more normalised shape, but there is
 * no positions *table* to hang it off — `user.position` is a free-text
 * name kept tidy by a curated dropdown (`orgList.model.js`), so a profile
 * would be keyed on a string anyway, and the first question anybody asks
 * ("who requires this, and at what level") would become a join.
 *
 * `valueKey` is the lower-cased copy the match actually runs on, for the
 * same reason Branch and OrgList carry one: "Sotuvchi" typed twice with
 * different case must not become two requirements that each exempt the
 * other's people.
 */
const requirementSchema = new Schema(
  {
    scope: { type: String, enum: ['POSITION', 'DEPARTMENT', 'BRANCH'], required: true },
    value: { type: String, required: true, trim: true },
    valueKey: { type: String, required: true, lowercase: true, trim: true },
    level: { type: Number, min: 1, required: true },
  },
  { _id: true }
)

const competencySchema = new Schema(
  {
    // Stable identifier, so an import, a report column or a 360° template
    // can point at a competency that somebody later renames.
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Free-text grouping ("Texnik", "Boshqaruv", "Xavfsizlik"). Not a
    // reference: the groups differ per company and inventing a second
    // catalogue to hold nine words is not worth the screen it needs.
    category: { type: String, default: '', trim: true },

    levels: { type: [levelSchema], default: [] },
    requirements: { type: [requirementSchema], default: [] },

    // What to take when the level is short. Only courses for now — a path
    // is a sequence of courses, and 13.4 (development plan) is the place
    // where "what should I do about this gap" becomes a plan rather than a
    // suggestion.
    developmentCourseIds: { type: [Schema.Types.ObjectId], ref: 'Course', default: [] },

    // How long an assessment stays true, in days. 0 means it does not
    // expire. A first-aid certificate expires; "speaks Russian" does not.
    validityDays: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    order: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

competencySchema.index({ status: 1, category: 1, order: 1 })
// "Which competencies does a Sotuvchi in Marketing need?" — asked once per
// person on every matrix row and on every /mine.
competencySchema.index({ 'requirements.valueKey': 1 })

export const Competency = model('Competency', competencySchema)
