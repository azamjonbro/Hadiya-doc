import { eventService } from '../services/events/event.service.js'
import { eventRegistrationService } from '../services/events/eventRegistration.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const eventController = {
  calendar: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventService.calendar(req.validatedQuery))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventService.getById(req.params.id, req.user))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventService.create(req.user, req.body), 'Event created', 201)
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventService.update(req.user, req.params.id, req.body), 'Event updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await eventService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Event deleted')
  }),

  register: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventRegistrationService.register(req.user, req.params.id), 'Registered')
  }),

  cancelRegistration: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await eventRegistrationService.cancel(req.user, req.params.id, { userId: req.body?.userId }),
      'Registration cancelled'
    )
  }),

  registrations: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventRegistrationService.list(req.params.id))
  }),

  markAttendance: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventRegistrationService.markAttendance(req.user, req.params.id, req.body.entries))
  }),
}
