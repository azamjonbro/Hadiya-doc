import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { assessmentController } from '../../controllers/assessment.controller.js'
import {
  updateAssessmentSchema,
  submitAssessmentSchema,
  assessmentFocusLossSchema,
} from '../../validators/assessment.validator.js'

export const assessmentsRouter = Router()

assessmentsRouter.use(authenticate)

assessmentsRouter.get('/:id', requirePermission(PERMISSIONS.VIDEO_VIEW), assessmentController.getById)
assessmentsRouter.put(
  '/:id',
  requirePermission(PERMISSIONS.VIDEO_MANAGE),
  validateBody(updateAssessmentSchema),
  assessmentController.update
)
assessmentsRouter.delete('/:id', requirePermission(PERMISSIONS.VIDEO_MANAGE), assessmentController.remove)
// Opening a sitting is what hands the questions over — GET /:id gives a
// learner only the briefing (see assessment.service.js), so the 15-minute
// clock cannot be sidestepped by reading the test first.
assessmentsRouter.post('/:id/start', requirePermission(PERMISSIONS.VIDEO_VIEW), assessmentController.start)
assessmentsRouter.post(
  '/:id/focus-loss',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  validateBody(assessmentFocusLossSchema),
  assessmentController.reportFocusLoss
)
assessmentsRouter.post(
  '/:id/submit',
  requirePermission(PERMISSIONS.VIDEO_VIEW),
  validateBody(submitAssessmentSchema),
  assessmentController.submit
)
