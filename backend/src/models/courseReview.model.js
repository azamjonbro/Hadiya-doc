import { Schema, model } from 'mongoose'

// One review per user per course (upsert on repeat submission — spec-adjacent
// feature, not in the original 58-section spec, added on explicit request).
const courseReviewSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true },
  },
  { timestamps: true }
)

courseReviewSchema.index({ courseId: 1, userId: 1 }, { unique: true })
courseReviewSchema.index({ courseId: 1, createdAt: -1 })

export const CourseReview = model('CourseReview', courseReviewSchema)
