import { eventService } from '../services/events/event.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const eventController = {
  calendar: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventService.calendar(req.validatedQuery))
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await eventService.getById(req.params.id))
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
}
