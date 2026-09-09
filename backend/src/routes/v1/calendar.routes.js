import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { calendarController } from '../../controllers/calendar.controller.js'

export const calendarRouter = Router()

const calendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

// Everything here is the caller's own calendar, built from their own
// assignments and registrations — there is no id to pass and nothing to
// scope, so being signed in is the whole authorisation.
calendarRouter.use(authenticate)

calendarRouter.get('/', validateQuery(calendarQuerySchema), calendarController.list)
calendarRouter.get('/export.ics', validateQuery(calendarQuerySchema), calendarController.ics)
