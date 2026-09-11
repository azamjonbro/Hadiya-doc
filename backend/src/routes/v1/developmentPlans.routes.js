import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { developmentPlanController } from '../../controllers/developmentPlan.controller.js'
import {
  createPlanSchema,
  updatePlanSchema,
  addGoalSchema,
  updateGoalSchema,
  goalProgressSchema,
  reviewSchema,
  listPlansQuerySchema,
  dueQuerySchema,
  createPlanTypeSchema,
  updatePlanTypeSchema,
  createPlanTemplateSchema,
  updatePlanTemplateSchema,
  assignTemplateSchema,
} from '../../validators/developmentPlan.validator.js'

export const developmentPlansRouter = Router()

developmentPlansRouter.use(authenticate)

/**
 * The employee's own plan. Declared before '/:id' so 'mine' is never read as
 * a plan id, the same ordering onboarding needs for its own /mine.
 *
 * `devplan:read:own` opens this and nothing else: the service reads the
 * caller's id off the token rather than from the path, so there is no
 * parameter to tamper with.
 */
developmentPlansRouter.get('/mine', requirePermission(PERMISSIONS.DEVPLAN_READ_OWN), developmentPlanController.mine)

developmentPlansRouter.get(
  '/',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  scopeToManagedUsers,
  validateQuery(listPlansQuerySchema),
  developmentPlanController.list
)

// Plan types and templates (rasn 12–14). Literal segments, before '/:id'.
// devplan:manage for all of it: a template is a plan waiting for a name.
const manage = requirePermission(PERMISSIONS.DEVPLAN_MANAGE)
developmentPlansRouter.get('/types', manage, developmentPlanController.listTypes)
developmentPlansRouter.post('/types', manage, validateBody(createPlanTypeSchema), developmentPlanController.createType)
developmentPlansRouter.patch('/types/:id', manage, validateBody(updatePlanTypeSchema), developmentPlanController.updateType)
developmentPlansRouter.delete('/types/:id', manage, developmentPlanController.removeType)
developmentPlansRouter.get('/templates', manage, developmentPlanController.listTemplates)
developmentPlansRouter.post('/templates', manage, validateBody(createPlanTemplateSchema), developmentPlanController.createTemplate)
developmentPlansRouter.get('/templates/:id', manage, developmentPlanController.getTemplate)
developmentPlansRouter.patch('/templates/:id', manage, validateBody(updatePlanTemplateSchema), developmentPlanController.updateTemplate)
developmentPlansRouter.delete('/templates/:id', manage, developmentPlanController.removeTemplate)
developmentPlansRouter.post('/templates/:id/assign', manage, validateBody(assignTemplateSchema), developmentPlanController.assignTemplate)

// Plans whose period is nearly over — whoever chases reviews reads this.
developmentPlansRouter.get(
  '/due',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  scopeToManagedUsers,
  validateQuery(dueQuerySchema),
  developmentPlanController.due
)

// The competency gaps (13.1) a plan for this person would be written
// against. A read of somebody else's record, so it is a management route.
developmentPlansRouter.get(
  '/suggestions/:userId',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  developmentPlanController.suggestions
)

developmentPlansRouter.post(
  '/',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  validateBody(createPlanSchema),
  developmentPlanController.create
)

/**
 * Either permission opens the read, and the service decides which of the two
 * applied: the owner sees their own plan, a manager sees one of their own
 * people, and anybody else gets DEVPLAN_NOT_OWN or DEVPLAN_SCOPE_FORBIDDEN.
 * The gate cannot make that call — it does not know whose plan this is.
 */
developmentPlansRouter.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.DEVPLAN_MANAGE, PERMISSIONS.DEVPLAN_READ_OWN),
  developmentPlanController.get
)

developmentPlansRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  validateBody(updatePlanSchema),
  developmentPlanController.update
)

developmentPlansRouter.delete('/:id', requirePermission(PERMISSIONS.DEVPLAN_MANAGE), developmentPlanController.remove)

developmentPlansRouter.post(
  '/:id/goals',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  validateBody(addGoalSchema),
  developmentPlanController.addGoal
)

developmentPlansRouter.patch(
  '/:id/goals/:goalId',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  validateBody(updateGoalSchema),
  developmentPlanController.updateGoal
)

developmentPlansRouter.delete(
  '/:id/goals/:goalId',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  developmentPlanController.removeGoal
)

// Moving a goal the platform cannot measure. Open to the plan's owner as
// well as their manager — "I read the book" is the employee's fact to
// report — and refused outright on course and competency goals, whose
// progress is read from the record on every load.
developmentPlansRouter.post(
  '/:id/goals/:goalId/progress',
  requireAnyPermission(PERMISSIONS.DEVPLAN_MANAGE, PERMISSIONS.DEVPLAN_READ_OWN),
  validateBody(goalProgressSchema),
  developmentPlanController.setGoalProgress
)

developmentPlansRouter.post(
  '/:id/review',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  validateBody(reviewSchema),
  developmentPlanController.review
)

// Paying out CPE credits without a full review — for a plan approved before
// a goal was finished. Idempotent per goal.
developmentPlansRouter.post(
  '/:id/credits',
  requirePermission(PERMISSIONS.DEVPLAN_MANAGE),
  developmentPlanController.accrue
)
