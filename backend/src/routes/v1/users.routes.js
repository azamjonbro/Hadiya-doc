import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireSelfOrPermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { chatSendRateLimiter } from '../../middlewares/chatRateLimit.middleware.js'
import { userController } from '../../controllers/user.controller.js'
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  activityQuerySchema,
  bulkMessageSchema,
  bulkUserIdsSchema,
  notificationPrefsSchema,
  updateLocaleSchema,
} from '../../validators/user.validator.js'

export const usersRouter = Router()

usersRouter.use(authenticate)

usersRouter.get('/me', userController.me)

// Own settings. No permission gate beyond authenticate: these act on the
// caller's own account by definition — `actor.id` is the only id involved,
// so there is nothing to authorise against.
usersRouter.get('/me/notification-prefs', userController.notificationPrefs)
usersRouter.put(
  '/me/notification-prefs',
  validateBody(notificationPrefsSchema),
  userController.updateNotificationPrefs
)
usersRouter.put('/me/locale', validateBody(updateLocaleSchema), userController.updateLocale)

usersRouter.get('/', requirePermission(PERMISSIONS.USER_READ), validateQuery(listUsersQuerySchema), userController.list)
usersRouter.post('/', requirePermission(PERMISSIONS.USER_CREATE), validateBody(createUserSchema), userController.create)
// Declared before '/:id' — Express matches in order, so a literal segment
// that could also be read as an id has to come first.
usersRouter.get('/departments', requirePermission(PERMISSIONS.USER_READ), userController.listDepartments)
usersRouter.get('/branches', requirePermission(PERMISSIONS.USER_READ), userController.listBranches)
usersRouter.get('/branches/overview', requirePermission(PERMISSIONS.USER_READ), userController.branchOverview)
usersRouter.get('/positions', requirePermission(PERMISSIONS.USER_READ), userController.listPositions)
// Bulk actions from the employees table. Declared before '/:id' for the same
// reason the literal segments above are, and gated on the same permissions
// their single-row counterparts use: writing to an employee needs to be able
// to see them, switching an account off is the DELETE handler's permission.
// Hiding the buttons in the admin app is not the check — this is.
usersRouter.post(
  '/bulk/message',
  requirePermission(PERMISSIONS.USER_READ),
  chatSendRateLimiter,
  validateBody(bulkMessageSchema),
  userController.bulkMessage
)
usersRouter.post(
  '/bulk/deactivate',
  requirePermission(PERMISSIONS.USER_DELETE),
  validateBody(bulkUserIdsSchema),
  userController.bulkDeactivate
)

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
