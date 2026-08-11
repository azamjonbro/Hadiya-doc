import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { notificationController } from '../../controllers/notification.controller.js'
import { listNotificationsQuerySchema } from '../../validators/notification.validator.js'

export const notificationsRouter = Router()

notificationsRouter.use(authenticate)

notificationsRouter.get('/', validateQuery(listNotificationsQuerySchema), notificationController.list)
notificationsRouter.patch('/read-all', notificationController.markAllRead)
notificationsRouter.patch('/:id/read', notificationController.markRead)
