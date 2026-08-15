import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { attentionPolicyController } from '../../controllers/attentionPolicy.controller.js'
import { attentionPolicySchema } from '../../validators/attentionPolicy.validator.js'

export const attentionPolicyRouter = Router()

attentionPolicyRouter.use(authenticate)

// Readable by anyone who can open a course: the employee app has to know the
// rules it is about to be held to before the first frame plays.
attentionPolicyRouter.get('/', requirePermission(PERMISSIONS.COURSE_READ), attentionPolicyController.getGlobal)
attentionPolicyRouter.put(
  '/',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(attentionPolicySchema),
  attentionPolicyController.updateGlobal
)
