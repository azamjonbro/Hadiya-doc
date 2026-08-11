import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { taskController } from '../../controllers/task.controller.js'
import { createTaskSchema, updateTaskSchema, listTasksQuerySchema } from '../../validators/task.validator.js'

export const tasksRouter = Router()

tasksRouter.use(authenticate)

tasksRouter.get('/my', validateQuery(listTasksQuerySchema), taskController.listMy)
tasksRouter.get(
  '/assigned-by-me',
  requirePermission(PERMISSIONS.TASK_CREATE),
  validateQuery(listTasksQuerySchema),
  taskController.listAssignedByMe
)
tasksRouter.post('/', requirePermission(PERMISSIONS.TASK_CREATE), validateBody(createTaskSchema), taskController.create)
tasksRouter.get('/:id', taskController.getById)
tasksRouter.patch('/:id', validateBody(updateTaskSchema), taskController.update)
tasksRouter.delete('/:id', taskController.remove)
