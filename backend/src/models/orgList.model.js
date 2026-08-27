import { Schema, model } from 'mongoose'
import { ORG_LIST_TYPE_VALUES } from '@lms/shared'

/**
 * One row of a curated dropdown: a job title, a department, a subdivision or a
 * country. Four lists rather than four collections, because they differ in
 * nothing except the label above the select.
 *
 * Like Branch, this does not own the value. `User.position`, `.department`,
 * `.subdivision` and `.country` still store the name itself, and every filter
 * compares names — the list exists so an entry can be created before anyone is
 * in it, and so the same word is not typed four different ways.
 */
const orgListSchema = new Schema(
  {
    type: { type: String, enum: ORG_LIST_TYPE_VALUES, required: true },
    name: { type: String, required: true, trim: true },
    // Lower-cased copy of `name`, and the field the unique index is on, so
    // "Sotuvchi" and "sotuvchi" cannot become two entries that each filter out
    // the other's people. Same reasoning as Branch.nameKey.
    nameKey: { type: String, required: true, lowercase: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

orgListSchema.index({ type: 1, nameKey: 1 }, { unique: true })

export const OrgList = model('OrgList', orgListSchema)
