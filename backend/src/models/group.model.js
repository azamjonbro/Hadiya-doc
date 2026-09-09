import { Schema, model } from 'mongoose'

// A group is a named set of employees plus the courses opened to them —
// the unit a manager actually thinks in ("Sotuv jamoasi"), sitting above
// the per-user CourseAssignment rows it drives.
//
// Members and courses are embedded id arrays rather than a join collection:
// a group holds tens (not millions) of each, they are always read together
// with the group, and the authoritative enrolment record still lives in
// CourseAssignment — these arrays only say who/what the group covers.
const groupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    department: { type: String, default: '' },
    // STATIC is a list somebody curates. DYNAMIC is a rule, and its
    // `memberIds` are a cache of who currently matches — recomputed, never
    // edited by hand, because a hand edit would be silently reverted at the
    // next refresh and nobody would know why their addition vanished.
    type: { type: String, enum: ['STATIC', 'DYNAMIC'], default: 'STATIC' },
    // Only meaningful when type is DYNAMIC. Same shape as an enrolment
    // rule's `match` and read the same way: OR within a field, AND across
    // them, an empty array meaning no constraint on that field.
    rule: {
      roles: { type: [String], default: [] },
      departments: { type: [String], default: [] },
      branches: { type: [String], default: [] },
      positions: { type: [String], default: [] },
    },
    // When the membership cache was last rebuilt. Shown in the UI, because
    // "who is in this group" having a staleness is a fact the person
    // looking at it needs.
    membersRefreshedAt: { type: Date, default: null },
    memberIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    courseIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Course' }], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

// Case-insensitive uniqueness, so "Sotuv" and "sotuv" can't both exist and
// leave a manager guessing which group they just assigned someone to.
groupSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })
groupSchema.index({ memberIds: 1 })

export const Group = model('Group', groupSchema)
