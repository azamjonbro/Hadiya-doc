import mongoose from 'mongoose'
import { CourseReview } from '../models/courseReview.model.js'

export const courseReviewRepository = {
  findByUserAndCourse(userId, courseId) {
    return CourseReview.findOne({ userId, courseId })
  },

  upsert(userId, courseId, { rating, comment }) {
    return CourseReview.findOneAndUpdate(
      { userId, courseId },
      { $set: { rating, comment } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
  },

  listPage(courseId, { cursor, limit }) {
    const filter = { courseId }
    if (cursor) filter._id = { $lt: cursor }
    return CourseReview.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
  },

  aggregate(courseId) {
    // Raw aggregation pipelines skip Mongoose's automatic query-filter
    // casting (unlike find()), so courseId must be cast to an ObjectId by
    // hand or $match silently compares it against the string form of
    // every document's courseId and matches nothing.
    return CourseReview.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ])
  },

  findById(id) {
    return CourseReview.findById(id)
  },

  deleteById(id) {
    return CourseReview.findByIdAndDelete(id)
  },
}
