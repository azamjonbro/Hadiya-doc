import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { taskController } from '../../controllers/task.controller.js'
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  updateTaskBatchSchema,
  batchScopeQuerySchema,
} from '../../validators/task.validator.js'

export const tasksRouter = Router()

tasksRouter.use(authenticate)

tasksRouter.get('/my', validateQuery(listTasksQuerySchema), taskController.listMy)
tasksRouter.get(
  '/assigned-by-me',
  requirePermission(PERMISSIONS.TASK_CREATE),
  validateQuery(listTasksQuerySchema),
  taskController.listAssignedByMe
)
// Unpaginated (capped) card feed for the kanban board — see the service note.
tasksRouter.get('/board', requirePermission(PERMISSIONS.TASK_CREATE), taskController.board)

tasksRouter.post('/', requirePermission(PERMISSIONS.TASK_CREATE), validateBody(createTaskSchema), taskController.create)

// Fan-out operations. Declared before the `/:id` routes so a two-segment
// `/batch/<id>` path can never be read as a task id, and gated on
// TASK_CREATE because only an assigner has a batch to act on in the first
// place — an assignee changes their own copy through PATCH /:id.
tasksRouter.patch(
  '/batch/:batchId',
  requirePermission(PERMISSIONS.TASK_CREATE),
  validateBody(updateTaskBatchSchema),
  taskController.updateBatch
)
tasksRouter.delete(
  '/batch/:batchId',
  requirePermission(PERMISSIONS.TASK_CREATE),
  validateQuery(batchScopeQuerySchema),
  taskController.removeBatch
)

tasksRouter.get('/:id', taskController.getById)
tasksRouter.patch('/:id', validateBody(updateTaskSchema), taskController.update)
tasksRouter.delete('/:id', taskController.remove)
