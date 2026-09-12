import { Schema, model } from 'mongoose'

/**
 * A competency profile (rasm: «Профили компетенций»): the set of
 * competencies, each at a required level, that a position needs. A
 * competency's own `requirements` say the same thing one competency at a
 * time; a profile says it for a whole role at once, and is what an HR
 * person actually writes ("Regional manager: commercial thinking 3,
 * systems thinking 2 …"). Both count: the bar for a person is the highest
 * level any matching rule asks for.
 */
const profileItemSchema = new Schema(
  {
    competencyId: { type: Schema.Types.ObjectId, ref: 'Competency', required: true },
    level: { type: Number, min: 1, max: 10, required: true },
  },
  { _id: false }
)

const competencyProfileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Job titles the profile applies to (org-list POSITION names); keys are
    // the lower-cased match the requirement rules use.
    positions: { type: [String], default: [] },
    positionKeys: { type: [String], default: [] },
    items: { type: [profileItemSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

competencyProfileSchema.index({ name: 1 })
competencyProfileSchema.index({ positionKeys: 1 })

export const CompetencyProfile = model('CompetencyProfile', competencyProfileSchema)

/**
 * Folders the competency catalogue is filed under (rasm: the tree on the
 * «Компетенции» page). A competency names its folder by `category`; a
 * folder row exists so an empty one can be created first and filled later.
 */
const competencyFolderSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
)

competencyFolderSchema.index({ name: 1 }, { unique: true })

export const CompetencyFolder = model('CompetencyFolder', competencyFolderSchema)
