import { developmentPlanService } from '../services/developmentPlans/developmentPlan.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const developmentPlanController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.list(req.user, req.scopedUserIds, req.validatedQuery))
  }),

  /** The employee's own plans — the only route `devplan:read:own` opens. */
  mine: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.mine(req.user.id))
  }),

  due: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.dueForReview(req.scopedUserIds, req.validatedQuery))
  }),

  suggestions: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.suggestions(req.user, req.params.userId))
  }),

  get: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.getById(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.create(req.user, req.body), 'Plan created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.update(req.user, req.params.id, req.body))
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.remove(req.user, req.params.id))
  }),

  addGoal: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.addGoal(req.user, req.params.id, req.body), 'Goal added', 201)
  }),

  updateGoal: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.updateGoal(req.user, req.params.id, req.params.goalId, req.body))
  }),

  removeGoal: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.removeGoal(req.user, req.params.id, req.params.goalId))
  }),

  setGoalProgress: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await developmentPlanService.setGoalProgress(req.user, req.params.id, req.params.goalId, req.body)
    )
  }),

  review: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.review(req.user, req.params.id, req.body), 'Review recorded', 201)
  }),

  accrue: asyncHandler(async (req, res) => {
    sendSuccess(res, await developmentPlanService.accrue(req.user, req.params.id), 'CPE credits accrued')
  }),
}
