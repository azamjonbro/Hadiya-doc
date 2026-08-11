import { processNewsEvents } from '../analytics/newsEventProcessor.js'
import { newsReportService } from '../services/analytics/newsReport.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const newsAnalyticsController = {
  ingestEvents: asyncHandler(async (req, res) => {
    const result = await processNewsEvents({
      userId: req.user.id,
      newsId: req.params.id,
      events: req.body.events,
    })
    sendSuccess(res, result)
  }),

  getOwnReport: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsReportService.getReport(req.user, req.params.id, req.user.id))
  }),

  getUserReport: asyncHandler(async (req, res) => {
    sendSuccess(res, await newsReportService.getReport(req.user, req.params.id, req.params.userId))
  }),
}
