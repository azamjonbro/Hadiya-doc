import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { scopeToManagedUsers } from '../../middlewares/scopeToManagedUsers.middleware.js'
import { pathController } from '../../controllers/path.controller.js'
import {
  createPathSchema,
  updatePathSchema,
  listPathsQuerySchema,
  assignPathSchema,
} from '../../validators/path.validator.js'

export const pathsRouter = Router()

pathsRouter.use(authenticate)

// Reading the catalog is path:read, which every role holds. Which paths a
// given person actually sees is decided by targeting inside the service —
// the permission says "may look at the catalog", not "may see everything".
pathsRouter.get(
  '/',
  requirePermission(PERMISSIONS.PATH_READ),
  validateQuery(listPathsQuerySchema),
  pathController.list
)
pathsRouter.post('/', requirePermission(PERMISSIONS.PATH_MANAGE), validateBody(createPathSchema), pathController.create)

pathsRouter.get('/:id', requirePermission(PERMISSIONS.PATH_READ), pathController.getById)
pathsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.PATH_MANAGE),
  validateBody(updatePathSchema),
  pathController.update
)
pathsRouter.delete('/:id', requirePermission(PERMISSIONS.PATH_MANAGE), pathController.remove)

// Joining one yourself, versus being put on one by somebody else.
pathsRouter.post('/:id/enroll', requirePermission(PERMISSIONS.PATH_READ), pathController.enrollSelf)
pathsRouter.post(
  '/:id/assign',
  requirePermission(PERMISSIONS.PATH_ASSIGN),
  validateBody(assignPathSchema),
  pathController.assign
)

// The progress table, fenced to whoever the caller may see (2.2).
pathsRouter.get(
  '/:id/enrollments',
  requirePermission(PERMISSIONS.PATH_ASSIGN),
  scopeToManagedUsers,
  pathController.enrollments
)
