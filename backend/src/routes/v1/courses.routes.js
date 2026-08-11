import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { courseController } from '../../controllers/course.controller.js'
import { courseAssignmentController } from '../../controllers/courseAssignment.controller.js'
import {
  createCourseSchema,
  updateCourseSchema,
  listCoursesQuerySchema,
  createTopicSchema,
  createAssignmentSchema,
} from '../../validators/course.validator.js'

export const coursesRouter = Router()

coursesRouter.use(authenticate)

coursesRouter.get(
  '/',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateQuery(listCoursesQuerySchema),
  courseController.list
)
coursesRouter.post(
  '/',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateBody(createCourseSchema),
  courseController.create
)
coursesRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_READ), courseController.getById)
coursesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateCourseSchema),
  courseController.update
)
coursesRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_DELETE), courseController.archive)

coursesRouter.get('/:id/topics', requirePermission(PERMISSIONS.COURSE_READ), courseController.listTopics)
coursesRouter.post(
  '/:id/topics',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(createTopicSchema),
  courseController.createTopic
)

coursesRouter.get(
  '/:id/assignments',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  courseAssignmentController.listForCourse
)
coursesRouter.post(
  '/:id/assignments',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(createAssignmentSchema),
  courseAssignmentController.assign
)
