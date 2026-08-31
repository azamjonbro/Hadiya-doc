import { Router } from 'express'
import { ROLES } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { facePolicyController } from '../../controllers/facePolicy.controller.js'
import { facePolicySchema } from '../../validators/facePolicy.validator.js'

export const facePolicyRouter = Router()

facePolicyRouter.use(authenticate)

// SUPERADMIN-only, matching the rest of face.routes.js: a role check rather
// than a permission, so it stays SUPERADMIN-only even if a custom role is
// later handed every course-management permission. How often an employee has
// to prove their identity is not a course-editing decision.
facePolicyRouter.get('/', requireRole(ROLES.SUPERADMIN), facePolicyController.getGlobal)
facePolicyRouter.put(
  '/',
  requireRole(ROLES.SUPERADMIN),
  validateBody(facePolicySchema),
  facePolicyController.updateGlobal
)
