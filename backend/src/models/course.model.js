import { Schema, model } from 'mongoose'

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '' },
    cover: { type: String, default: '' },
    banner: { type: String, default: '' },
    // Which certificate is issued when this course is finished. Null means
    // the course does not certify, which is most of them — a certificate for
    // every course is a certificate worth nothing.
    //
    // The rest of the course metadata §3.4 describes (category, tags, level,
    // prerequisites) lands in 3.4; this one field is here early because the
    // issuing path in 3.2 has nothing to read without it.
    certificateTemplateId: { type: Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null },

    // What "finished" means for this course.
    //
    // Until 3.1 it meant "every published video is complete", decided inside
    // the video event processor — so a course made of a presentation and a
    // test could never finish (there were no videos to complete, and the
    // guard was `publishedVideoIds.length > 0`), while a course whose videos
    // were done finished even with its mandatory test failed. Both are now
    // one rule, on the course, evaluated in one place.
    completionRule: {
      // The share of the course's items that must be complete. 100 is
      // "everything"; a lower number lets a course finish on most of it,
      // which is what a long optional library wants.
      minPercent: { type: Number, min: 1, max: 100, default: 100 },
      // Items marked required must be complete whatever minPercent says.
      // A course can be 90%-to-pass and still insist on the safety test.
      requireAllRequired: { type: Boolean, default: true },
    },

    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
    // Empty targetRoles + empty branches + empty department means "no
    // restriction" (visible to everyone) — the default, backward-compatible
    // with every existing course. When set, every constraint that is set must
    // match (role AND branch AND department).
    targetRoles: { type: [String], default: [] },
    // A list, not a single value: one course routinely runs in several offices
    // ("Toshkent va Samarqand, Buxoroga emas"), which a lone string cannot
    // express. Empty = every branch.
    branches: { type: [String], default: [] },
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
