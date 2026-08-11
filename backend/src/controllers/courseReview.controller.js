import { courseReviewService } from '../services/courses/courseReview.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const courseReviewController = {
  upsert: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseReviewService.upsert(req.user, req.params.id, req.body), 'Review saved')
  }),

  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await courseReviewService.list(req.user, req.params.id, req.validatedQuery))
  }),

  remove: asyncHandler(async (req, res) => {
    await courseReviewService.remove(req.user, req.params.id, req.params.reviewId)
    sendSuccess(res, null, 'Review deleted')
  }),
}
