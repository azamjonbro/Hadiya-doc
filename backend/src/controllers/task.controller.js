import { taskService } from '../services/tasks/task.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const taskController = {
  listMy: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.listMy(req.user, req.validatedQuery))
  }),

  listAssignedByMe: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.listAssignedByMe(req.user, req.validatedQuery))
  }),

  board: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.listBoard(req.user))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.getById(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.create(req.user, req.body), 'Task created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.update(req.user, req.params.id, req.body), 'Task updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await taskService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Task deleted')
  }),

  updateBatch: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.updateBatch(req.user, req.params.batchId, req.body), 'Task batch updated')
  }),

  removeBatch: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await taskService.removeBatch(req.user, req.params.batchId, req.validatedQuery),
      'Task batch deleted'
    )
  }),
}
