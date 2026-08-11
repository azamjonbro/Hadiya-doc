import { notificationService } from '../services/notifications/notification.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const notificationController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationService.list(req.user, req.validatedQuery))
  }),

  markRead: asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationService.markRead(req.user, req.params.id), 'Marked as read')
  }),

  markAllRead: asyncHandler(async (req, res) => {
    await notificationService.markAllRead(req.user)
    sendSuccess(res, null, 'All marked as read')
  }),
}
