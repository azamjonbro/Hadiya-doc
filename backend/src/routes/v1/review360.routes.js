import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { review360Controller } from '../../controllers/review360.controller.js'
import {
  createTemplateSchema,
  updateTemplateSchema,
  createCycleSchema,
  updateCycleSchema,
  listCyclesQuerySchema,
  listTemplatesQuerySchema,
  myAssignmentsQuerySchema,
  submitResponseSchema,
} from '../../validators/review360.validator.js'

export const review360Router = Router()

review360Router.use(authenticate)

/* -------- the rater's own inbox -------- */
// Declared first so 'assignments' and 'mine' are never read as an id, and
// gated on RESPOND rather than on any admin permission: answering a
// questionnaire is something every employee does.
review360Router.get(
  '/mine',
  requirePermission(PERMISSIONS.REVIEW360_RESPOND),
  validateQuery(myAssignmentsQuerySchema),
  review360Controller.mine
)
review360Router.get(
  '/assignments/:id',
  requirePermission(PERMISSIONS.REVIEW360_RESPOND),
  review360Controller.getAssignment
)
review360Router.post(
  '/assignments/:id/respond',
  requirePermission(PERMISSIONS.REVIEW360_RESPOND),
  validateBody(submitResponseSchema),
  review360Controller.respond
)

/* -------- templates -------- */
review360Router.get(
  '/templates',
  requirePermission(PERMISSIONS.REVIEW360_MANAGE),
  validateQuery(listTemplatesQuerySchema),
  review360Controller.listTemplates
)
review360Router.post(
  '/templates',
  requirePermission(PERMISSIONS.REVIEW360_MANAGE),
  validateBody(createTemplateSchema),
  review360Controller.createTemplate
)
review360Router.get('/templates/:id', requirePermission(PERMISSIONS.REVIEW360_MANAGE), review360Controller.getTemplate)
review360Router.patch(
  '/templates/:id',
  requirePermission(PERMISSIONS.REVIEW360_MANAGE),
  validateBody(updateTemplateSchema),
  review360Controller.updateTemplate
)
review360Router.delete(
  '/templates/:id',
  requirePermission(PERMISSIONS.REVIEW360_MANAGE),
  review360Controller.deleteTemplate
)

/* -------- cycles -------- */
// Listing and reading a cycle is open to RESULTS_VIEW as well as MANAGE,
// and every one of those routes carries scopeToManagedUsers: a manager sees
// the cycles their own people are in, not the company's.
review360Router.get(
  '/cycles',
  requireAnyPermission(PERMISSIONS.REVIEW360_MANAGE, PERMISSIONS.REVIEW360_RESULTS_VIEW),
  scopeToManagedUsers,
  validateQuery(listCyclesQuerySchema),
  review360Controller.listCycles
)
review360Router.post(
  '/cycles',
  requirePermission(PERMISSIONS.REVIEW360_MANAGE),
  validateBody(createCycleSchema),
  review360Controller.createCycle
)
review360Router.get(
  '/cycles/:id',
  requireAnyPermission(PERMISSIONS.REVIEW360_MANAGE, PERMISSIONS.REVIEW360_RESULTS_VIEW),
  scopeToManagedUsers,
  review360Controller.getCycle
)
review360Router.patch(
  '/cycles/:id',
  requirePermission(PERMISSIONS.REVIEW360_MANAGE),
  validateBody(updateCycleSchema),
  review360Controller.updateCycle
)
review360Router.delete('/cycles/:id', requirePermission(PERMISSIONS.REVIEW360_MANAGE), review360Controller.deleteCycle)

review360Router.get(
  '/cycles/:id/raters',
  requirePermission(PERMISSIONS.REVIEW360_MANAGE),
  review360Controller.previewRaters
)
review360Router.post('/cycles/:id/launch', requirePermission(PERMISSIONS.REVIEW360_MANAGE), review360Controller.launchCycle)
review360Router.post('/cycles/:id/close', requirePermission(PERMISSIONS.REVIEW360_MANAGE), review360Controller.closeCycle)

review360Router.get(
  '/cycles/:id/progress',
  requireAnyPermission(PERMISSIONS.REVIEW360_MANAGE, PERMISSIONS.REVIEW360_RESULTS_VIEW),
  scopeToManagedUsers,
  review360Controller.progress
)

// RESPOND is on this gate because a subject reads their own report without
// holding any admin permission; the service is what refuses somebody else's.
review360Router.get(
  '/cycles/:id/results/:subjectId',
  requireAnyPermission(
    PERMISSIONS.REVIEW360_MANAGE,
    PERMISSIONS.REVIEW360_RESULTS_VIEW,
    PERMISSIONS.REVIEW360_RESPOND
  ),
  scopeToManagedUsers,
  review360Controller.results
)
