import { Badge } from '../../models/badge.model.js'
import { UserBadge } from '../../models/userBadge.model.js'
import { CourseAssignment } from '../../models/courseAssignment.model.js'
import { Certificate } from '../../models/certificate.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { QuizAttempt } from '../../models/quizAttempt.model.js'
import { pointsLedgerRepository } from '../../repositories/pointsLedger.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'

/**
 * Earning badges, and remembering when.
 *
 * Before 7.4 a badge was a hard-coded rule recomputed on every read. That
 * has two problems that only show up later: adding a badge needs a deploy,
 * and nothing records the moment one was earned — so it cannot be
 * announced, cannot appear on a timeline, and quietly vanishes if the
 * underlying total ever drops.
 *
 * Awarding is therefore one-way and written down. A badge is a record that
 * something happened, not a status reflecting the present, so a points
 * correction does not take it back.
 */

/** Everything a criterion can be measured against, for one person. */
export async function metricsFor(userId) {
  const [summary, coursesCompleted, certificates, paths, perfect] = await Promise.all([
    pointsLedgerRepository.getSummary(String(userId)),
    CourseAssignment.countDocuments({ userId, status: 'COMPLETED' }),
    Certificate.countDocuments({ userId, revokedAt: null }),
    PathEnrollment.countDocuments({ userId, status: 'COMPLETED' }),
    QuizAttempt.countDocuments({ userId, scorePercent: 100 }),
  ])

  return {
    TOTAL_POINTS: summary.totalPoints ?? 0,
    VIDEOS_COMPLETED: summary.videosCompleted ?? 0,
    // Both kinds of test count: the split between a video quiz and a topic
    // assessment is an implementation detail the learner never saw, and
    // 4.2 merged them anyway.
    QUIZZES_PASSED: (summary.quizzesPassed ?? 0) + (summary.assessmentsPassed ?? 0),
    COURSES_COMPLETED: coursesCompleted,
    CERTIFICATES_EARNED: certificates,
    PATHS_COMPLETED: paths,
    PERFECT_QUIZZES: perfect,
  }
}

/** Every criterion must be met. An OR badge is two badges. */
export function meetsCriteria(badge, metrics) {
  const criteria = badge.criteria ?? []
  // A badge with no criteria would be earned by everybody the moment it is
  // created, which is never what somebody meant to configure.
  if (!criteria.length) return false
  return criteria.every((criterion) => (metrics[criterion.metric] ?? 0) >= criterion.threshold)
}

export const badgeService = {
  /**
   * Awards whatever this person has newly earned.
   *
   * Idempotent through the unique {userId, badgeId} index rather than a
   * check-then-write: this runs after every points event, and two of them
   * can overlap.
   */
  async evaluate(userId, { notify = true } = {}) {
    const [badges, held, metrics] = await Promise.all([
      Badge.find({ active: true }).lean(),
      UserBadge.find({ userId }, { badgeId: 1 }).lean(),
      metricsFor(userId),
    ])

    const heldIds = new Set(held.map((row) => String(row.badgeId)))
    const awarded = []

    for (const badge of badges) {
      if (heldIds.has(String(badge._id))) continue
      if (!meetsCriteria(badge, metrics)) continue

      try {
        await UserBadge.create({
          userId,
          badgeId: badge._id,
          code: badge.code,
          // What the metrics stood at. Impossible to reconstruct later, and
          // it is what lets a profile say "500 points, reached in March".
          snapshot: Object.fromEntries(
            (badge.criteria ?? []).map((criterion) => [criterion.metric, metrics[criterion.metric] ?? 0])
          ),
        })
        awarded.push(badge)
      } catch (error) {
        // Already awarded by an overlapping evaluation. The retry did its
        // job by doing nothing.
        if (error.code !== 11000) throw error
      }
    }

    if (notify) {
      for (const badge of awarded) {
        await notificationService
          .notify({
            userId,
            type: 'BADGE_EARNED',
            vars: { badgeName: badge.name || badge.code, badgeCode: badge.code },
            relatedEntityType: 'Badge',
            relatedEntityId: String(badge._id),
          })
          .catch((error) => logger.warn('Badge notice failed', { code: badge.code, error: error.message }))
      }
    }

    return { awarded: awarded.map((badge) => badge.code) }
  },

  /** What somebody holds, newest first. */
  async listFor(userId) {
    const rows = await UserBadge.find({ userId }).sort({ earnedAt: -1 }).populate('badgeId').lean()
    return {
      items: rows.map((row) => ({
        code: row.code,
        // Falls back to the stored code when the badge has been deleted
        // from the catalog: the person still earned it.
        name: row.badgeId?.name ?? row.code,
        description: row.badgeId?.description ?? '',
        icon: row.badgeId?.icon ?? 'award',
        tier: row.badgeId?.tier ?? 'BRONZE',
        earnedAt: row.earnedAt,
        snapshot: row.snapshot ?? null,
      })),
    }
  },

  /**
   * The catalog, with how far this person is from each.
   *
   * Progress towards a badge is the half that makes a badge list worth
   * looking at — "3 of 5 quizzes" is a reason to take a fourth.
   */
  async catalogFor(userId) {
    const [badges, held, metrics] = await Promise.all([
      Badge.find({ active: true }).sort({ order: 1, code: 1 }).lean(),
      UserBadge.find({ userId }, { badgeId: 1, earnedAt: 1 }).lean(),
      metricsFor(userId),
    ])
    const heldBy = new Map(held.map((row) => [String(row.badgeId), row.earnedAt]))

    return {
      items: badges.map((badge) => ({
        code: badge.code,
        name: badge.name || badge.code,
        description: badge.description ?? '',
        icon: badge.icon ?? 'award',
        tier: badge.tier,
        earnedAt: heldBy.get(String(badge._id)) ?? null,
        criteria: (badge.criteria ?? []).map((criterion) => ({
          metric: criterion.metric,
          threshold: criterion.threshold,
          current: Math.min(metrics[criterion.metric] ?? 0, criterion.threshold),
        })),
      })),
    }
  },
}
