import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { onboardingController } from '../../controllers/onboarding.controller.js'
import {
  createProgramSchema,
  updateProgramSchema,
  startOnboardingSchema,
} from '../../validators/onboarding.validator.js'

export const onboardingRouter = Router()

onboardingRouter.use(authenticate)

// The new hire's own checklist — no permission beyond being signed in, and
// declared before '/:id' so 'mine' is never read as a programme id.
onboardingRouter.get('/mine', onboardingController.mine)
onboardingRouter.post('/enrollments/:id/steps/:stepId/complete', onboardingController.completeStep)

// Designing programmes is an HR act, gated on the permission that already
// means "may change employee records".
onboardingRouter.get('/', requirePermission(PERMISSIONS.USER_UPDATE), onboardingController.listPrograms)
onboardingRouter.post(
  '/',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateBody(createProgramSchema),
  onboardingController.createProgram
)
onboardingRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateBody(updateProgramSchema),
  onboardingController.updateProgram
)
onboardingRouter.delete('/:id', requirePermission(PERMISSIONS.USER_UPDATE), onboardingController.deleteProgram)

onboardingRouter.post(
  '/:id/start',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateBody(startOnboardingSchema),
  onboardingController.start
)
onboardingRouter.get(
  '/:id/enrollments',
  requirePermission(PERMISSIONS.USER_READ),
  scopeToManagedUsers,
  onboardingController.enrollments
)
