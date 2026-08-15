import { Schema, model } from 'mongoose'

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '' },
    cover: { type: String, default: '' },
    banner: { type: String, default: '' },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
    // Empty targetRoles + empty department means "no restriction" (visible
    // to everyone) — the default, backward-compatible with every existing
    // course. When set, both constraints must match (role AND department).
    targetRoles: { type: [String], default: [] },
    department: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Trash, not archive. ARCHIVED is a retired-but-real course that still
    // appears in listings and reports; a course with `deletedAt` set is gone
    // from every one of them and only exists on the trash page, where it is
    // either restored or destroyed for good. Deleting a course cascades into
    // topics, videos and analytics, so making the destructive step reversible
    // is worth one nullable field on every query.
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export const Course = model('Course', courseSchema)
