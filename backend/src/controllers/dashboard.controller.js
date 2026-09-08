import { dashboardCacheService } from '../services/analytics/dashboardCache.service.js'
import { hasUnscopedAccess } from '../services/access/actorScope.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

export const dashboardController = {
  get: asyncHandler(async (req, res) => {
    // The cached payload is company-wide by construction: the scheduled job
    // aggregates every employee once, with no notion of who will read it.
    // Handing that to a department-scoped caller would undo the fence the
    // rest of their session runs behind, so they are refused rather than
    // quietly shown everyone. The team-scoped dashboard is its own endpoint
    // and its own aggregation; until it exists this is the honest answer.
    if (!hasUnscopedAccess(req.user)) {
      throw ApiError.forbidden(
        'This dashboard covers the whole company; a team-scoped view is not available yet',
        'DASHBOARD_SCOPE_FORBIDDEN'
      )
    }
    const payload = await dashboardCacheService.read()
    sendSuccess(res, payload)
  }),
}
