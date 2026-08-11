import { processVideoEvents } from '../analytics/videoEventProcessor.js'
import { videoReportService } from '../services/analytics/videoReport.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

function parseUserAgent(userAgent = '') {
  const device = /Mobi|Android/i.test(userAgent) ? 'mobile' : 'desktop'
  let browser = 'unknown'
  if (/Edg\//.test(userAgent)) browser = 'edge'
  else if (/Chrome\//.test(userAgent)) browser = 'chrome'
  else if (/Firefox\//.test(userAgent)) browser = 'firefox'
  else if (/Safari\//.test(userAgent)) browser = 'safari'
  return { device, browser }
}

export const videoAnalyticsController = {
  ingestEvents: asyncHandler(async (req, res) => {
    const { device, browser } = parseUserAgent(req.headers['user-agent'])
    const result = await processVideoEvents({
      userId: req.user.id,
      sessionId: req.body.sessionId,
      videoId: req.body.videoId,
      events: req.body.events,
      device,
      browser,
    })
    sendSuccess(res, result)
  }),

  getOwnReport: asyncHandler(async (req, res) => {
    const report = await videoReportService.getReport(req.user, req.params.videoId, req.user.id)
    sendSuccess(res, report)
  }),

  getUserReport: asyncHandler(async (req, res) => {
    const report = await videoReportService.getReport(req.user, req.params.videoId, req.params.userId)
    sendSuccess(res, report)
  }),
}
