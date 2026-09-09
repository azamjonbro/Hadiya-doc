import { calendarService, toIcs } from '../services/calendar/calendar.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const calendarController = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await calendarService.build(req.user, req.validatedQuery))
  }),

  /**
   * The same calendar as a file to import.
   *
   * A download, not a subscription: a subscribable feed needs a long-lived
   * token in the URL, and a URL that shows somebody's whole calendar to
   * anyone who has it needs a way to revoke it. That is worth building
   * properly rather than as a side effect of this endpoint.
   */
  ics: asyncHandler(async (req, res) => {
    const { items } = await calendarService.build(req.user, req.validatedQuery)
    const filename = `qollanma-${new Date().toISOString().slice(0, 10)}.ics`
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(toIcs(items))
  }),
}
