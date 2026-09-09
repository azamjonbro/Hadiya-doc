import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { enrollmentRuleController } from '../../controllers/enrollmentRule.controller.js'
import {
  createEnrollmentRuleSchema,
  updateEnrollmentRuleSchema,
} from '../../validators/enrollmentRule.validator.js'

export const enrollmentRulesRouter = Router()

// A rule assigns courses to people, so it is gated on the permission that
// already means "may assign a course to somebody else".
enrollmentRulesRouter.use(authenticate, requirePermission(PERMISSIONS.COURSE_ASSIGN))

enrollmentRulesRouter.get('/', enrollmentRuleController.list)
enrollmentRulesRouter.post('/', validateBody(createEnrollmentRuleSchema), enrollmentRuleController.create)
enrollmentRulesRouter.patch('/:id', validateBody(updateEnrollmentRuleSchema), enrollmentRuleController.update)
enrollmentRulesRouter.delete('/:id', enrollmentRuleController.remove)

// Dry run first, for the same reason the import wizard has one: a rule that
// turns out to match four hundred people is worth finding out about before
// it has assigned them all something.
enrollmentRulesRouter.get('/:id/preview', enrollmentRuleController.preview)
enrollmentRulesRouter.post('/:id/run', enrollmentRuleController.run)
