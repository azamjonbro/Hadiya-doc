import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { eventController } from '../../controllers/event.controller.js'
import {
  createEventSchema,
  updateEventSchema,
  calendarQuerySchema,
  markAttendanceSchema,
  cancelRegistrationSchema,
} from '../../validators/event.validator.js'
import { idempotent } from '../../middlewares/idempotency.middleware.js'

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

// Taking a seat is the learner's own act — event:read is enough, and the
// service decides whether there is one or a place in the queue (AT-31).
eventsRouter.post('/:id/register', idempotent(), eventController.register)
eventsRouter.post(
  '/:id/cancel-registration',
  validateBody(cancelRegistrationSchema),
  eventController.cancelRegistration
)

// The attendance sheet belongs to whoever runs the event.
eventsRouter.get('/:id/registrations', requirePermission(PERMISSIONS.EVENT_CREATE), eventController.registrations)
eventsRouter.post(
  '/:id/attendance',
  requirePermission(PERMISSIONS.EVENT_CREATE),
  validateBody(markAttendanceSchema),
  eventController.markAttendance
)
