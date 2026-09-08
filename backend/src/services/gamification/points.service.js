import { PERMISSIONS } from '@lms/shared'
import { pointsLedgerRepository } from '../../repositories/pointsLedger.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { groupRepository } from '../../repositories/group.repository.js'
import { computeEarnedBadges } from '../../gamification/badgeDefinitions.js'
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

export const pointsService = {
  async award(userId, videoId, courseId, points, source) {
    if (!points || points <= 0) return { awarded: false }
    try {
      await pointsLedgerRepository.create({ userId, videoId, courseId, points, source })
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
      return { awarded: true, points }
    } catch (error) {
      // Unique {userId, assessmentId} index — already paid out for this assessment.
      if (error.code === 11000) return { awarded: false }
      throw error
    }
  },

  async getSummary(userId) {
    const summary = await pointsLedgerRepository.getSummary(userId)
    return { ...summary, badges: computeEarnedBadges(summary) }
  },

  // One ranking for both audiences: employees see the plain top-20, while
  // the admin view narrows by group/department/period and asks for
  // zero-point people too (a manager needs to see who has done nothing —
  // an employee-facing board of zeros is just noise).
  async getLeaderboard(actor, { limit = 20, groupId, department, period = 'all', includeZero = false } = {}) {
    // Narrowing the board is a management action: without analytics:view:all
    // an employee gets the plain company-wide top list and nothing else.
    const canFilter = Boolean(actor?.permissions?.includes(PERMISSIONS.ANALYTICS_VIEW_ALL))
    if (!canFilter) {
      groupId = undefined
      department = undefined
      includeZero = false
    }

    let candidates
    if (groupId) {
      const group = await groupRepository.findById(groupId)
      if (!group) throw ApiError.notFound('Group not found')
      if (actor && !hasUnscopedAccess(actor)) {
        const actorUser = await userRepository.findById(actor.id)
        if (group.department !== actorUser?.department) {
          throw ApiError.forbidden('Managers can only view groups in their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
        }
      }
      candidates = group.memberIds.length ? await userRepository.findByIds(group.memberIds) : []
      candidates = candidates.filter((user) => user.isActive)
    } else {
      // A manager's board never reaches outside their own department, the
      // same fence applied to users, tasks and assignments.
      if (actor && !hasUnscopedAccess(actor)) {
        const actorUser = await userRepository.findById(actor.id)
        department = actorUser?.department ?? ''
      }
      candidates = await userRepository.listActive({ department })
    }

    const userIds = candidates.map((user) => user._id.toString())
    if (!userIds.length) return { period, rows: [], totalRanked: 0 }

    const totals = await pointsLedgerRepository.totalsForUsers({ userIds, since: periodStart(period) })
    const totalsByUserId = new Map(totals.map((row) => [row.userId, row]))

    // The board is readable by every signed-in employee, so a row carries only
    // what a colleague may see: a name, a face and a score. The JSHSHIR is a
    // national identity number — it used to be sent to everyone here, which
    // turned a motivational widget into a company-wide directory of identity
    // documents. It now rides along only for the management view, which is
    // already gated on analytics:view:all and needs it to line rows up with
    // the employee records.
    const merged = candidates.map((user) => {
      const points = totalsByUserId.get(user._id.toString())
      return {
        userId: user._id.toString(),
        fullName: user.fullName,
        ...(canFilter ? { jshshir: user.jshshir } : {}),
        avatar: user.avatar,
        department: user.department,
        position: user.position,
        totalPoints: points?.totalPoints ?? 0,
        videosCompleted: points?.videosCompleted ?? 0,
        quizzesPassed: points?.quizzesPassed ?? 0,
        assessmentsPassed: points?.assessmentsPassed ?? 0,
        lastEarnedAt: points?.lastEarnedAt ?? null,
      }
    })

    const visible = includeZero ? merged : merged.filter((row) => row.totalPoints > 0)
    // Name breaks ties so the order is stable between requests rather than
    // depending on however Mongo happened to return the users.
    visible.sort((a, b) => b.totalPoints - a.totalPoints || a.fullName.localeCompare(b.fullName))

    return {
      period,
      totalRanked: visible.length,
      rows: withRanks(visible).slice(0, limit),
    }
  },
}
