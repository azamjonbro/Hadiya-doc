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

    // --- Catalog metadata (3.4) ---

    categoryId: { type: Schema.Types.ObjectId, ref: 'CourseCategory', default: null },
    // Free-form, unlike the category. Tags are how the same course ends up
    // findable as "elektr", "xavfsizlik" and "yillik" at once, which a
    // single category cannot express.
    tags: { type: [String], default: [] },
    level: { type: String, enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], default: 'BEGINNER' },
    // Who wrote it, as opposed to `createdBy`, who clicked "new course".
    // Usually the same person, and routinely not: content teams have an
    // author and an administrator who uploads it.
    authorIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    // What the catalog promises. Not derived from video durations: a course
    // is reading and thinking as well as watching, and a number computed
    // from playback length consistently understates it.
    estimatedMinutes: { type: Number, min: 0, default: 0 },
    // Courses that must be finished first. Enforced at assignment/visibility
    // time (Blok 5); stored here because the prerequisite belongs to the
    // course, not to each assignment of it.
    prerequisiteCourseIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Course' }], default: [] },

    // SEQUENTIAL is what the platform already does — courseSequence.js locks
    // a lesson until the one before it is complete. The default therefore
    // matches existing behaviour exactly, which is what makes M3 a pure
    // `$set` of defaults with nothing to decide per course.
    navigationMode: { type: String, enum: ['SEQUENTIAL', 'FREE'], default: 'SEQUENTIAL' },

    // How long a *completion* of this course counts for, in days. 0 means
    // it does not expire. Distinct from the certificate template's own
    // validity: compliance may require retraining every year even for a
    // course that issues no certificate at all.
    validityDays: { type: Number, min: 0, default: 0 },

    // Bumped by hand when the content changes materially. Recorded on the
    // course rather than inferred from `updatedAt`, because fixing a typo
    // and rewriting half the lessons both touch `updatedAt` and only one of
    // them should mean anything to a learner who finished the old version.
    version: { type: Number, min: 1, default: 1 },

    // Whether an employee may enrol themselves, or must wait to be
    // assigned. False keeps the current behaviour: everything is assigned.
    allowSelfEnroll: { type: Boolean, default: false },

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

/**
 * Full-text index over the fields a person would search by name.
 *
 * Weighted so a title match outranks a description that happens to mention
 * the word — without weights, a long description of one course beats the
 * exact title of another, which is the opposite of useful.
 *
 * The catalog list still searches by substring (see course.repository.js).
 * `$text` matches whole words only, so switching the list over would break
 * search-as-you-type: "mehn" would stop finding "mehnat muhofazasi". This
 * index is for the global search in 7.1, where the query is a finished word.
 */
courseSchema.index(
  { title: 'text', description: 'text', tags: 'text' },
  { weights: { title: 10, tags: 4, description: 1 }, name: 'course_text' }
)
courseSchema.index({ categoryId: 1, status: 1 })

export const Course = model('Course', courseSchema)
