import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { courseAssignmentController } from '../../controllers/courseAssignment.controller.js'
import { updateAssignmentSchema } from '../../validators/course.validator.js'

export const assignmentsRouter = Router()

assignmentsRouter.use(authenticate)

assignmentsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(updateAssignmentSchema),
  courseAssignmentController.update
)
assignmentsRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_ASSIGN), courseAssignmentController.remove)
