import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { complianceController } from '../../controllers/compliance.controller.js'
import { createRecurringSchema, updateRecurringSchema } from '../../validators/compliance.validator.js'

export const complianceRouter = Router()

complianceRouter.use(authenticate)

// The matrix is a report about people, so it is fenced to whoever the
// caller may see (2.2) — a supervisor gets their own team's compliance,
// not the company's.
complianceRouter.get(
  '/matrix',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  scopeToManagedUsers,
  complianceController.matrix
)

// A rule assigns mandatory training, so it sits behind the permission that
// already means "may assign a course to somebody else".
complianceRouter.use(requirePermission(PERMISSIONS.COURSE_ASSIGN))

complianceRouter.get('/', complianceController.list)
complianceRouter.post('/', validateBody(createRecurringSchema), complianceController.create)
complianceRouter.patch('/:id', validateBody(updateRecurringSchema), complianceController.update)
complianceRouter.delete('/:id', complianceController.remove)
complianceRouter.post('/:id/run', complianceController.run)
