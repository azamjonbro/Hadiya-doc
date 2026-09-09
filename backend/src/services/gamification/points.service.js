import { PERMISSIONS } from '@lms/shared'
import { pointsLedgerRepository } from '../../repositories/pointsLedger.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { groupRepository } from '../../repositories/group.repository.js'
import { badgeService } from './badge.service.js'
import { UserBadge } from '../../models/userBadge.model.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'
import { hasUnscopedAccess } from '../access/actorScope.js'

const DAY_MS = 24 * 60 * 60 * 1000
const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 }

function periodStart(period) {
  const days = PERIOD_DAYS[period]
  return days ? new Date(Date.now() - days * DAY_MS) : null
}

// Dense ranking: equal totals share a rank and the next distinct total takes
// the following number, so two people tied for 1st are both "1" and the
// next is "2" — not "3".
function withRanks(rows) {
  let rank = 0
  let previousPoints = null
  return rows.map((row) => {
    if (row.totalPoints !== previousPoints) {
      rank += 1
      previousPoints = row.totalPoints
    }
    return { ...row, rank }
  })
}

/**
 * Badges are evaluated after points change, not on read.
 *
 * Best-effort on purpose: the points are the fact, and failing to work out
 * whether they crossed a badge threshold must not fail the award that
 * caused it. The next points event re-evaluates anyway.
 */
async function evaluateBadges(userId) {
  try {
    await badgeService.evaluate(userId)
  } catch (error) {
    logger.warn('Badge evaluation failed', { userId: String(userId), error: error.message })
  }
}

export const pointsService = {
  async award(userId, videoId, courseId, points, source) {
    if (!points || points <= 0) return { awarded: false }
    try {
      await pointsLedgerRepository.create({ userId, videoId, courseId, points, source })
      await evaluateBadges(userId)
      return { awarded: true, points }
    } catch (error) {
      // Unique {userId, videoId} index — already paid out for this video.
      if (error.code === 11000) return { awarded: false }
      throw error
    }
  },

  async awardForAssessment(userId, assessmentId, courseId, points) {
    if (!points || points <= 0) return { awarded: false }
    try {
      await pointsLedgerRepository.create({ userId, assessmentId, courseId, points, source: 'ASSESSMENT' })
      await evaluateBadges(userId)
      return { awarded: true, points }
    } catch (error) {
      // Unique {userId, assessmentId} index — already paid out for this assessment.
      if (error.code === 11000) return { awarded: false }
      throw error
    }
  },

  async getSummary(userId) {
    const [summary, held] = await Promise.all([
      pointsLedgerRepository.getSummary(userId),
      // Read from what was awarded, not recomputed from the totals (7.4).
      // Recomputing means a badge quietly disappears if a total ever drops,
      // and nothing can say when it was earned.
      UserBadge.find({ userId }, { code: 1 }).sort({ earnedAt: 1 }).lean(),
    ])
    return { ...summary, badges: held.map((row) => row.code) }
  },

  // One ranking for both audiences: employees see the plain top-20, while
  // the admin view narrows by group/department/period and asks for
  // zero-point people too (a manager needs to see who has done nothing —
  // an employee-facing board of zeros is just noise).
  //
  // The ranking itself is done by the database (see rankUsers): this used to
  // load every active employee, sum the ledger for all of them and sort the
  // whole company in memory to show twenty rows. That also quietly capped
  // the board at the 500 employees listActive returned, so on a larger
  // tenant the "top 20" was the top 20 of whoever came first alphabetically.
  async getLeaderboard(actor, { limit = 20, groupId, department, period = 'all', includeZero = false } = {}) {
    // Narrowing the board is a management action: without analytics:view:all
    // an employee gets the plain company-wide top list and nothing else.
    const canFilter = Boolean(actor?.permissions?.includes(PERMISSIONS.ANALYTICS_VIEW_ALL))
    if (!canFilter) {
      groupId = undefined
      department = undefined
      includeZero = false
    }

    let memberIds
    if (groupId) {
      const group = await groupRepository.findById(groupId)
      if (!group) throw ApiError.notFound('Group not found')
      if (actor && !hasUnscopedAccess(actor)) {
        const actorUser = await userRepository.findById(actor.id)
        if (group.department !== actorUser?.department) {
          throw ApiError.forbidden('Managers can only view groups in their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
        }
      }
      if (!group.memberIds.length) return { period, rows: [], totalRanked: 0 }
      memberIds = group.memberIds.map((id) => id.toString())
    } else if (actor && !hasUnscopedAccess(actor)) {
      // A manager's board never reaches outside their own department, the
      // same fence applied to users, tasks and assignments.
      const actorUser = await userRepository.findById(actor.id)
      department = actorUser?.department ?? ''
    }

    const scope = { memberIds, department }
    const ranked = await pointsLedgerRepository.rankUsers({ ...scope, since: periodStart(period), limit })

    // The board is readable by every signed-in employee, so a row carries only
    // what a colleague may see: a name, a face and a score. The JSHSHIR is a
    // national identity number — it used to be sent to everyone here, which
    // turned a motivational widget into a company-wide directory of identity
    // documents. It now rides along only for the management view, which is
    // already gated on analytics:view:all and needs it to line rows up with
    // the employee records.
    const shape = (user, totals) => ({
      userId: user._id.toString(),
      fullName: user.fullName,
      ...(canFilter ? { jshshir: user.jshshir } : {}),
      avatar: user.avatar,
      department: user.department,
      position: user.position,
      totalPoints: totals?.totalPoints ?? 0,
      videosCompleted: totals?.videosCompleted ?? 0,
      quizzesPassed: totals?.quizzesPassed ?? 0,
      assessmentsPassed: totals?.assessmentsPassed ?? 0,
      lastEarnedAt: totals?.lastEarnedAt ?? null,
    })

    let rows = ranked.rows.map(({ user, ...totals }) => shape(user, totals))
    let totalRanked = ranked.totalRanked

    if (includeZero) {
      // Everyone in scope is on this board, so its size is the headcount and
      // not the number of earners. The people with no points all tie at zero,
      // so they sort last by name — which is exactly the order listActive
      // returns them in, and only as many as the page still has room for.
      totalRanked = await userRepository.countActive(scope)
      if (rows.length < limit) {
        const idle = await userRepository.listActive({
          ...scope,
          excludeIds: ranked.rows.map((row) => row.userId),
          limit: limit - rows.length,
        })
        rows = rows.concat(idle.map((user) => shape(user)))
      }
    }

    return { period, totalRanked, rows: withRanks(rows) }
  },
}
