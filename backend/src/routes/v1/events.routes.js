import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { eventController } from '../../controllers/event.controller.js'
import { createEventSchema, updateEventSchema, calendarQuerySchema } from '../../validators/event.validator.js'

export const eventsRouter = Router()

eventsRouter.use(authenticate)
eventsRouter.use(requirePermission(PERMISSIONS.EVENT_READ))

eventsRouter.get('/calendar', validateQuery(calendarQuerySchema), eventController.calendar)
eventsRouter.post('/', requirePermission(PERMISSIONS.EVENT_CREATE), validateBody(createEventSchema), eventController.create)
eventsRouter.get('/:id', eventController.getById)
eventsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.EVENT_CREATE),
  validateBody(updateEventSchema),
  eventController.update
)
eventsRouter.delete('/:id', requirePermission(PERMISSIONS.EVENT_CREATE), eventController.remove)
