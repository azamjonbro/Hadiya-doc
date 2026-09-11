import { LearningPath } from '../../models/learningPath.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { notificationService } from '../notifications/notification.service.js'
import { formatNotificationDate, daysUntil } from '../../utils/notificationFormat.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The two deadline reminders a path can switch on in its builder.
 *
 * Before: once, when the deadline is within `beforeDeadline.days`. After:
 * once per configured N, when the deadline is N or more days behind. Both
 * are stamped on the enrolment so the fifteen-minute sweep does not repeat
 * itself, and both are read from the path at send time — switching a
 * reminder off stops the next sweep, not the next deploy.
 */
export async function sendPathDeadlineReminders({ now = new Date() } = {}) {
  const paths = await LearningPath.find(
    {
      deletedAt: null,
      $or: [{ 'notifications.beforeDeadline.enabled': true }, { 'notifications.afterDeadline.enabled': true }],
    },
    { title: 1, notifications: 1 }
  ).lean()
  let before = 0
  let after = 0

  for (const path of paths) {
    const n = path.notifications ?? {}
    if (n.beforeDeadline?.enabled) {
      const window = new Date(now.getTime() + (n.beforeDeadline.days ?? 3) * DAY_MS)
      const rows = await PathEnrollment.find({
        pathId: path._id,
        status: 'ACTIVE',
        deadline: { $gte: now, $lte: window },
        deadlineReminderSentAt: null,
      }).lean()
      if (rows.length) {
        try {
          await notificationService.notifyMany(
            rows.map((row) => ({
              userId: row.userId,
              type: 'PATH_DEADLINE_APPROACHING',
              vars: { pathTitle: path.title, deadline: formatNotificationDate(row.deadline), daysLeft: daysUntil(row.deadline, now) },
              relatedEntityType: 'LearningPath',
              relatedEntityId: String(path._id),
              severity: 'WARNING',
            }))
          )
        } finally {
          await PathEnrollment.updateMany({ _id: { $in: rows.map((row) => row._id) } }, { $set: { deadlineReminderSentAt: now } })
        }
        before += rows.length
      }
    }

    if (n.afterDeadline?.enabled) {
      const days = [...new Set((n.afterDeadline.days ?? [1]).filter((d) => d > 0))].sort((a, b) => a - b)
      for (const d of days) {
        const cutoff = new Date(now.getTime() - d * DAY_MS)
        const rows = await PathEnrollment.find({
          pathId: path._id,
          status: 'ACTIVE',
          deadline: { $ne: null, $lte: cutoff },
          overdueRemindersSent: { $ne: d },
        }).lean()
        if (!rows.length) continue
        try {
          await notificationService.notifyMany(
            rows.map((row) => ({
              userId: row.userId,
              type: 'PATH_OVERDUE',
              vars: { pathTitle: path.title, deadline: formatNotificationDate(row.deadline), daysOverdue: String(d) },
              relatedEntityType: 'LearningPath',
              relatedEntityId: String(path._id),
              severity: 'WARNING',
            }))
          )
        } finally {
          await PathEnrollment.updateMany({ _id: { $in: rows.map((row) => row._id) } }, { $addToSet: { overdueRemindersSent: d } })
        }
        after += rows.length
      }
    }
  }

  return { before, after }
}
