import { Schema, model } from 'mongoose'

/**
 * A rating scale for observation-sheet items (rasm: «Оценочные шкалы»).
 *
 * The plain sheet asks "did they do it — yes or no". A scale lets an item
 * be judged in steps ("not yet / with help / on their own / can teach it"),
 * each worth a share of the item's weight: `points / max points`. Levels
 * flagged `passes` count as PASS for the required-item rule; the rest as
 * FAIL. The seeded Yes/No scale is the one every item uses when it names
 * none, and it is locked — every old session was scored against it.
 */
const levelSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    points: { type: Number, min: 0, default: 0 },
    passes: { type: Boolean, default: false },
  },
  { _id: false }
)

const ojtScaleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    levels: { type: [levelSchema], default: [] },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

ojtScaleSchema.index({ name: 1 })

export const OjtScale = model('OjtScale', ojtScaleSchema)

/** What the checklist means when an item names no scale. */
export const YES_NO_SCALE = Object.freeze({
  name: 'Ha / Yo‘q',
  levels: [
    { label: 'Yo‘q', points: 0, passes: false },
    { label: 'Ha', points: 1, passes: true },
  ],
})
