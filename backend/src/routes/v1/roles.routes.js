import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { roleController } from '../../controllers/role.controller.js'
import { roleNameSchema } from '../../validators/role.validator.js'

export const rolesRouter = Router()

rolesRouter.use(authenticate)

// Reading the list is part of filling in the employee form, so it rides on
// user:read. Creating and deleting a role changes what an account is allowed
// to do, which is why those keep role:manage — SUPERADMIN only.
rolesRouter.get('/', requirePermission(PERMISSIONS.USER_READ), roleController.list)
rolesRouter.post('/', requirePermission(PERMISSIONS.ROLE_MANAGE), validateBody(roleNameSchema), roleController.create)
rolesRouter.delete('/:id', requirePermission(PERMISSIONS.ROLE_MANAGE), roleController.remove)
