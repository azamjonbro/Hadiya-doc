import { PERMISSIONS } from '@lms/shared'
import { courseRepository } from '../../repositories/course.repository.js'
import { courseReviewRepository } from '../../repositories/courseReview.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { ApiError } from '../../utils/ApiError.js'

function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

async function loadVisibleCourse(actor, courseId) {
  const course = await courseRepository.findById(courseId)
  if (!course) throw ApiError.notFound('Course not found')
  if (course.status !== 'PUBLISHED' && !canManageCourses(actor)) {
    throw ApiError.notFound('Course not found')
  }
  return course
}

function toPublicReview(review, user) {
  return {
    id: review._id.toString(),
    courseId: review.courseId.toString(),
    userId: review.userId.toString(),
    fullName: user?.fullName ?? '',
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  }
}

export const courseReviewService = {
  async upsert(actor, courseId, payload) {
    await loadVisibleCourse(actor, courseId)
    const [review, user] = await Promise.all([
      courseReviewRepository.upsert(actor.id, courseId, payload),
      userRepository.findById(actor.id),
    ])
    return toPublicReview(review, user)
  },

  async list(actor, courseId, query) {
    await loadVisibleCourse(actor, courseId)
    const [rows, aggregateRows] = await Promise.all([
      courseReviewRepository.listPage(courseId, query),
      courseReviewRepository.aggregate(courseId),
    ])

    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    const users = await userRepository.findByIds(items.map((r) => r.userId))
    const usersById = new Map(users.map((u) => [u._id.toString(), u]))

    const agg = aggregateRows[0] ?? { avgRating: 0, count: 0 }
    return {
      items: items.map((r) => toPublicReview(r, usersById.get(r.userId.toString()))),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
      avgRating: Math.round((agg.avgRating ?? 0) * 10) / 10,
      count: agg.count ?? 0,
    }
  },

  async remove(actor, courseId, reviewId) {
    const review = await courseReviewRepository.findById(reviewId)
    if (!review || review.courseId.toString() !== courseId) throw ApiError.notFound('Review not found')
    const isOwnReview = review.userId.toString() === actor.id
    if (!isOwnReview && !actor.permissions?.includes(PERMISSIONS.COURSE_UPDATE)) {
      throw ApiError.forbidden('You cannot delete this review')
    }
    await courseReviewRepository.deleteById(reviewId)
  },
}
