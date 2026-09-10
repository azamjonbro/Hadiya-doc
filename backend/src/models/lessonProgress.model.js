import { Schema, model } from 'mongoose'

/**
 * How far through a lesson an employee has read.
 *
 * Blocks seen, by id — the same reasoning as materialProgress' page set: a
 * reader who jumps to the last block has read one block, not all of them,
 * and a high-water mark would reward skipping to the end. Ids rather than
 * indexes, because an author who inserts a paragraph in the middle would
 * otherwise shift everybody's progress onto different content.
 *
 * There is deliberately no stored `completionPercent`. The denominator is
 * the lesson's current block list, which the author can change; a stored
 * percentage would be a second answer that goes stale the moment a block is
 * added, and the codebase already learned what two answers to "how far
 * through is this person" cost (3.1). It is computed where the lesson is at
 * hand, by lessonCompletion() in lessonBlocks.js.
 *
 * `completedAt` is the exception, and it is a fact rather than a
 * calculation: this person finished this lesson at this time. Finished stays
 * finished — an author adding a block later does not un-read what was read.
 */
const lessonProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    viewedBlocks: { type: [String], default: [] },
    firstViewedAt: { type: Date, default: null },
    lastViewedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

lessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true })
lessonProgressSchema.index({ courseId: 1, userId: 1 })

export const LessonProgress = model('LessonProgress', lessonProgressSchema)
