import { Schema, model } from 'mongoose'

/** Where a level came from. Kept on both the row and every history entry. */
export const COMPETENCY_SOURCES = Object.freeze([
  'SELF',
  'MANAGER',
  'REVIEW360',
  'OJT',
  'ASSESSMENT',
  'CERTIFICATE',
  'IMPORT',
])

const historySchema = new Schema(
  {
    level: { type: Number, min: 0, required: true },
    source: { type: String, enum: COMPETENCY_SOURCES, required: true },
    assessedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assessedAt: { type: Date, required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
)

/**
 * What one person's level in one competency is **now**.
 *
 * The alternative was an append-only assessment log with the current level
 * derived on read. Rejected: the two questions this collection exists to
 * answer instantly — "what is this person's level" and "who in this
 * department is below the bar" — would each become an aggregation with a
 * `$sort` + `$group` per person per competency, i.e. a report, on a screen
 * that has to paint in one go.
 *
 * History is not lost, it is bounded: the last `HISTORY_LIMIT` changes ride
 * along in an array trimmed by `$slice` on write. That is what the
 * before/after comparison needs, and a level changes a handful of times a
 * year, not a handful of times a day. When 13.2 and 13.3 land, the full
 * evidence stays with the instrument that produced it (a `reviewResponse`,
 * an `ojtObservation`); they *post* the resulting level here rather than
 * this row trying to be everybody's log.
 */
const userCompetencySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', required: true },

    // 0 is a real, deliberate value: "assessed, and does not have it". It is
    // not the same as having no row, which means nobody has looked.
    level: { type: Number, min: 0, required: true },
    source: { type: String, enum: COMPETENCY_SOURCES, default: 'MANAGER' },

    assessedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assessedAt: { type: Date, default: Date.now },
    // Computed from the competency's validityDays at assessment time, not
    // read through at display time: shortening the validity period must not
    // silently retro-expire what somebody already signed off.
    expiresAt: { type: Date, default: null },

    note: { type: String, default: '' },
    // What backs the claim, when something in the platform does.
    evidence: {
      type: { type: String, enum: ['NONE', 'COURSE', 'CERTIFICATE', 'QUIZ', 'OJT', 'REVIEW360'], default: 'NONE' },
      refId: { type: Schema.Types.ObjectId, default: null },
    },

    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
)

export const HISTORY_LIMIT = 20

// One holding per person per competency. Unique rather than "we upsert
// carefully": two managers assessing the same person in the same minute is
// exactly the case a careful upsert loses, and the loser is a level
// somebody typed.
userCompetencySchema.index({ userId: 1, competencyId: 1 }, { unique: true })
// The matrix reads by competency across a set of people, and the "who is
// below the bar" report reads by competency and level.
userCompetencySchema.index({ competencyId: 1, level: 1 })

export const UserCompetency = model('UserCompetency', userCompetencySchema)
