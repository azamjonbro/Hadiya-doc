import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { topicController } from '../../controllers/topic.controller.js'
import { updateTopicSchema } from '../../validators/course.validator.js'

export const topicsRouter = Router()

topicsRouter.use(authenticate)

topicsRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_READ), topicController.getById)
topicsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateTopicSchema),
  topicController.update
)
topicsRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_DELETE), topicController.remove)
