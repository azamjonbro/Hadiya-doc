import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireSelfOrPermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { userController } from '../../controllers/user.controller.js'
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  activityQuerySchema,
} from '../../validators/user.validator.js'

export const usersRouter = Router()

usersRouter.use(authenticate)

usersRouter.get('/me', userController.me)

usersRouter.get('/', requirePermission(PERMISSIONS.USER_READ), validateQuery(listUsersQuerySchema), userController.list)
usersRouter.post('/', requirePermission(PERMISSIONS.USER_CREATE), validateBody(createUserSchema), userController.create)
// Declared before '/:id' — Express matches in order, so a literal segment
// that could also be read as an id has to come first.
usersRouter.get('/departments', requirePermission(PERMISSIONS.USER_READ), userController.listDepartments)
usersRouter.get('/:id', requirePermission(PERMISSIONS.USER_READ), userController.getById)
usersRouter.patch('/:id', requirePermission(PERMISSIONS.USER_UPDATE), validateBody(updateUserSchema), userController.update)
usersRouter.delete('/:id', requirePermission(PERMISSIONS.USER_DELETE), userController.deactivate)
usersRouter.get('/:id/courses', requireSelfOrPermission('id', PERMISSIONS.USER_READ), userController.getCourses)
usersRouter.get(
  '/:id/learning-stats',
  requireSelfOrPermission('id', PERMISSIONS.USER_READ),
  userController.getLearningStats
)

// Employee detail tabs: learning/effort levels, day-by-day activity, test
// history with wrong answers, and assigned tasks with turnaround times.
usersRouter.get(
  '/:id/performance',
  requireSelfOrPermission('id', PERMISSIONS.USER_READ),
  userController.getPerformance
)
usersRouter.get(
  '/:id/activity',
  requireSelfOrPermission('id', PERMISSIONS.USER_READ),
  validateQuery(activityQuerySchema),
  userController.getActivity
)
usersRouter.get(
  '/:id/test-results',
  requireSelfOrPermission('id', PERMISSIONS.USER_READ),
  userController.getTestResults
)
usersRouter.get('/:id/tasks', requireSelfOrPermission('id', PERMISSIONS.USER_READ), userController.getTasks)
