import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { branchController } from '../../controllers/branch.controller.js'
import { branchNameSchema } from '../../validators/branch.validator.js'

export const branchesRouter = Router()

branchesRouter.use(authenticate)

// Reading the list is part of reading the org chart; changing it is not.
// Creating, renaming and deleting all move (or refuse to move) employee and
// course records, so they sit behind user:update rather than user:read.
branchesRouter.get('/', requirePermission(PERMISSIONS.USER_READ), branchController.overview)
branchesRouter.post('/', requirePermission(PERMISSIONS.USER_UPDATE), validateBody(branchNameSchema), branchController.create)
branchesRouter.patch('/:id', requirePermission(PERMISSIONS.USER_UPDATE), validateBody(branchNameSchema), branchController.rename)
branchesRouter.delete('/:id', requirePermission(PERMISSIONS.USER_UPDATE), branchController.remove)
