import { dashboardCacheService } from '../services/analytics/dashboardCache.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const dashboardController = {
  get: asyncHandler(async (req, res) => {
    const payload = await dashboardCacheService.read()
    sendSuccess(res, payload)
  }),
}
