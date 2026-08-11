import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireSelfOrPermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { userController } from '../../controllers/user.controller.js'
import { createUserSchema, updateUserSchema, listUsersQuerySchema } from '../../validators/user.validator.js'

export const usersRouter = Router()

usersRouter.use(authenticate)

usersRouter.get('/me', userController.me)

usersRouter.get('/', requirePermission(PERMISSIONS.USER_READ), validateQuery(listUsersQuerySchema), userController.list)
usersRouter.post('/', requirePermission(PERMISSIONS.USER_CREATE), validateBody(createUserSchema), userController.create)
usersRouter.get('/:id', requirePermission(PERMISSIONS.USER_READ), userController.getById)
usersRouter.patch('/:id', requirePermission(PERMISSIONS.USER_UPDATE), validateBody(updateUserSchema), userController.update)
usersRouter.delete('/:id', requirePermission(PERMISSIONS.USER_DELETE), userController.deactivate)
usersRouter.get('/:id/courses', requireSelfOrPermission('id', PERMISSIONS.USER_READ), userController.getCourses)
