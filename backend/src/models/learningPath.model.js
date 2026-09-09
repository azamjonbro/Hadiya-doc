import { Schema, model } from 'mongoose'

/**
 * An ordered programme of courses (and later events and assignments).
 *
 * A course answers "what do I need to know about X". A path answers "what
 * does somebody in this job need to have done" — onboarding, a
 * certification track, a development plan. Today that is expressed by
 * assigning six courses and hoping people do them in a sensible order,
 * which means nobody can say how far through the *programme* anybody is.
 *
 * `items[].refId` is deliberately untyped by ref: an item can be a course
 * now and an event or an assignment in Blok 6, and a polymorphic reference
 * is the honest shape for that. `type` says which collection to look in.
 */
const pathItemSchema = new Schema(
  {
    type: { type: String, enum: ['COURSE', 'EVENT', 'ASSIGNMENT', 'PATH'], default: 'COURSE' },
    refId: { type: Schema.Types.ObjectId, required: true },
    order: { type: Number, default: 0 },
    // Optional items exist so a path can offer depth without making it
    // compulsory. They do not count towards completion (AT-27) and they do
    // not block what follows.
    required: { type: Boolean, default: true },
    // Finer than `sequential`: an item that needs two specific earlier ones
    // rather than simply everything before it.
    prerequisiteIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: true }
)

// Purely presentational grouping ("Week 1", "Safety basics"). The order the
// path is *taken* in comes from item.order, so a section renamed or
// reordered cannot silently change who is allowed to open what.
const pathSectionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    itemIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: true }
)

const learningPathSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '' },
    cover: { type: String, default: '' },
    kind: {
      type: String,
      enum: ['GENERAL', 'ONBOARDING', 'CERTIFICATION', 'DEVELOPMENT'],
      default: 'GENERAL',
    },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },

    // When true, an item opens only once every required item before it is
    // done. Enforced server-side at the point a playback token is issued —
    // a lock that exists only in the sidebar is bypassed by typing the URL.
    sequential: { type: Boolean, default: true },

    items: { type: [pathItemSchema], default: [] },
    sections: { type: [pathSectionSchema], default: [] },

    // The same three targeting fields a course has, read by the same rule
    // (services/access/visibility.js).
    targetRoles: { type: [String], default: [] },
    branches: { type: [String], default: [] },
    department: { type: String, default: '' },

    certificateTemplateId: { type: Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null },
    // How long finishing the path counts for, in days. 0 means it does not
    // expire.
    validityDays: { type: Number, min: 0, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

learningPathSchema.index({ status: 1, kind: 1 })
// "Which paths contain this course?" — asked every time a course completes,
// so that the paths holding it can be re-evaluated.
learningPathSchema.index({ 'items.refId': 1 })

export const LearningPath = model('LearningPath', learningPathSchema)
