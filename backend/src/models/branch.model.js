import { Schema, model } from 'mongoose'

/**
 * A branch as a record of its own.
 *
 * The name is still what User.branch and Course.branches store — this
 * collection does not replace that, it exists so a branch can be created
 * before anyone is in it, and so renaming has something to rename. Everything
 * that reads branches keeps working off the name.
 */
const branchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lower-cased copy of `name`, and the field the unique index is on:
    // "Toshkent" and "toshkent" must not become two branches that each hide
    // courses from the other. Kept as a separate field rather than a collation
    // so the guarantee survives regardless of how a query is written.
    nameKey: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // The reference's unit card: a code and who heads it.
    code: { type: String, default: '', trim: true },
    headId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export const Branch = model('Branch', branchSchema)
