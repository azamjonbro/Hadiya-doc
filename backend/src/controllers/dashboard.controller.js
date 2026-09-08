import { dashboardCacheService } from '../services/analytics/dashboardCache.service.js'
import { hasUnscopedAccess, scopedUserIdsFor } from '../services/access/actorScope.js'
import { computeTeamDashboard } from '../analytics/teamDashboard.js'
import { User } from '../models/user.model.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

export const dashboardController = {
  get: asyncHandler(async (req, res) => {
    // The cached payload is company-wide by construction: the scheduled job
    // aggregates every employee once, with no notion of who will read it.
    // Handing that to a scoped caller would undo the fence the rest of their
    // session runs behind, so they are pointed at the team dashboard, which
    // is their own endpoint and their own aggregation.
    if (!hasUnscopedAccess(req.user)) {
      throw ApiError.forbidden(
        'This dashboard covers the whole company. Use /dashboard/team for the people you manage.',
        'DASHBOARD_SCOPE_FORBIDDEN'
      )
    }
    const payload = await dashboardCacheService.read()
    sendSuccess(res, payload)
  }),

  /**
   * The same page for someone who is fenced.
   *
   * Open to any scope, including ALL: an admin asking for "my team" is a
   * reasonable question, and answering it with the whole company is the
   * correct answer for someone whose scope is the whole company. Refusing
   * them would mean the endpoint's availability depends on the role, which
   * is precisely the coupling 2.2 removed.
   */
  team: asyncHandler(async (req, res) => {
    const scoped = req.scopedUserIds !== undefined ? req.scopedUserIds : await scopedUserIdsFor(req.user)
    // null means "no fence" — for this endpoint that is everyone, since the
    // question asked is "the people I answer for".
    const userIds = scoped ?? (await allActiveUserIds())
    sendSuccess(res, await computeTeamDashboard(userIds))
  }),
}

async function allActiveUserIds() {
  const rows = await User.find({ isActive: true }, { _id: 1 }).lean()
  return rows.map((row) => String(row._id))
}
