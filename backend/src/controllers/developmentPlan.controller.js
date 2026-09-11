import { developmentPlanService } from '../services/developmentPlans/developmentPlan.service.js'
import { planTemplateService } from '../services/developmentPlans/planTemplate.service.js'
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

  // ----- types and templates (rasn 12–14) -----
  listTypes: asyncHandler(async (_req, res) => {
    sendSuccess(res, await planTemplateService.listTypes())
  }),
  createType: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.createType(req.user, req.body), 'Plan type created', 201)
  }),
  updateType: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.updateType(req.user, req.params.id, req.body), 'Plan type updated')
  }),
  removeType: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.removeType(req.user, req.params.id), 'Plan type deleted')
  }),
  listTemplates: asyncHandler(async (_req, res) => {
    sendSuccess(res, await planTemplateService.listTemplates())
  }),
  getTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.getTemplate(req.params.id))
  }),
  createTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.createTemplate(req.user, req.body), 'Plan template created', 201)
  }),
  updateTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.updateTemplate(req.user, req.params.id, req.body), 'Plan template updated')
  }),
  removeTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.removeTemplate(req.user, req.params.id), 'Plan template deleted')
  }),
  assignTemplate: asyncHandler(async (req, res) => {
    sendSuccess(res, await planTemplateService.assign(req.user, req.params.id, req.body), 'Plans created', 201)
  }),
}
