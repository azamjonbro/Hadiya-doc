import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js'
import { orgListController } from '../../controllers/orgList.controller.js'
import { orgListNameSchema, orgListTypeParamSchema } from '../../validators/orgList.validator.js'

export const orgListsRouter = Router()

orgListsRouter.use(authenticate)

// Curated dropdowns for the employee form: positions, departments,
// subdivisions, countries. Same split as branches — reading the org chart is
// user:read, changing it moves employee records and so sits behind user:update.
orgListsRouter.get('/:type', requirePermission(PERMISSIONS.USER_READ), validateParams(orgListTypeParamSchema), orgListController.list)
orgListsRouter.post(
  '/:type',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateParams(orgListTypeParamSchema),
  validateBody(orgListNameSchema),
  orgListController.create
)
orgListsRouter.delete(
  '/:type/:id',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateParams(orgListTypeParamSchema),
  orgListController.remove
)
