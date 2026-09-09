import { Schema, model } from 'mongoose'

/**
 * Homework: something a learner produces and a person marks.
 *
 * Three things in this codebase are called some form of "assignment", and
 * they are not the same:
 *
 *   Assignment (this)      a piece of work set on a topic — an essay, a
 *                          photograph of a completed weld, a link to a
 *                          published article
 *   CourseAssignment       "this course has been given to this person"
 *   Task                   a to-do handed to somebody, unrelated to a
 *                          course
 *
 * The spec warns about exactly this confusion (§6.3), so the comment is
 * here rather than in a doc nobody opens while reading the file.
 */
const assignmentSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },

    title: { type: String, required: true, trim: true },
    instructions: { type: String, default: '' },

    // What a submission may consist of. More than one is normal: "upload
    // the photo and describe what you changed".
    submissionTypes: {
      type: [String],
      enum: ['FILE', 'TEXT', 'LINK'],
      default: ['TEXT'],
    },

    dueAt: { type: Date, default: null },
    // Late work is a policy question, not a technical one. Refusing it
    // outright loses work that was done; accepting it silently makes the
    // deadline meaningless — so it is allowed, marked late, within a window
    // the author sets.
    allowLate: { type: Boolean, default: true },
    lateWindowHours: { type: Number, min: 0, default: 0 },

    // 0 means unlimited. A resubmission is the normal way homework works —
    // the reviewer returns it and the learner fixes it.
    maxAttempts: { type: Number, min: 0, default: 0 },

    rubricId: { type: Schema.Types.ObjectId, ref: 'Rubric', default: null },
    maxScore: { type: Number, min: 0, default: 100 },

    // Who marks it. Empty means anybody holding the grading permission,
    // which is the small-team default; naming reviewers is how a large
    // cohort is split up.
    reviewerIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },

    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    order: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

assignmentSchema.index({ topicId: 1, order: 1 })
assignmentSchema.index({ courseId: 1, status: 1 })

export const Assignment = model('Assignment', assignmentSchema)
