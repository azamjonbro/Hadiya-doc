import { CourseAssignment } from '../models/courseAssignment.model.js'
import { Course } from '../models/course.model.js'
import { Task } from '../models/task.model.js'
import { notificationService } from '../services/notifications/notification.service.js'
import { logger } from '../config/logger.js'
import { formatNotificationDate, daysUntil } from '../utils/notificationFormat.js'
import { eventService } from '../services/events/event.service.js'
import { sendPathDeadlineReminders } from '../services/paths/pathReminders.js'

const DEADLINE_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000

// Every course a batch of assignments points at, in one query. The sweep used
// to call findById inside the loop, so a hundred assignments on the same
// course meant a hundred identical reads.
async function courseTitles(assignments) {
  const ids = [...new Set(assignments.map((a) => a.courseId?.toString()).filter(Boolean))]
  if (!ids.length) return new Map()
  const rows = await Course.find({ _id: { $in: ids } }, { title: 1 }).lean()
  return new Map(rows.map((row) => [row._id.toString(), row.title]))
}

/**
 * Send one notification per document, then stamp the "already reminded" field
 * on all of them in a single write.
 *
 * The stamp is in a `finally` on purpose. If delivery throws partway down the
 * batch, some of these people have already been told; leaving the whole batch
 * unstamped would tell them again on the next sweep, every fifteen minutes,
 * until the fault is fixed. A reminder that arrives once and is then dropped
 * is a smaller failure than one that arrives forty times, so the batch is
 * stamped either way.
 *
 * updateMany, not bulkWrite: every row gets the same field set to the same
 * timestamp, so there is nothing per-row for a bulkWrite to carry.
 */
async function notifyAndStamp(model, docs, field, now, build) {
  if (!docs.length) return
  try {
    // notifyMany, not a loop of notify: the sweep hands a hundred reminders
    // to a hundred different people, and notify reads each recipient's
    // account for their language and channel preferences.
    await notificationService.notifyMany(docs.map(build))
  } finally {
    await model.updateMany({ _id: { $in: docs.map((doc) => doc._id) } }, { $set: { [field]: now } })
  }
}

export async function runDeadlineChecks() {
  const now = new Date()
  const soon = new Date(now.getTime() + DEADLINE_WARNING_WINDOW_MS)

  const [approaching, expired, approachingTasks, overdueTasks] = await Promise.all([
    CourseAssignment.find({
      status: 'ACTIVE',
      deadline: { $gte: now, $lte: soon },
      deadlineReminderSentAt: null,
    }),
    CourseAssignment.find({
      status: 'ACTIVE',
      expiresAt: { $lte: now },
      expiryReminderSentAt: null,
    }),
    Task.find({
      status: { $in: ['TODO', 'IN_PROGRESS'] },
      deadline: { $gte: now, $lte: soon },
      deadlineReminderSentAt: null,
    }),
    Task.find({
      status: { $in: ['TODO', 'IN_PROGRESS'] },
      deadline: { $lte: now },
      overdueReminderSentAt: null,
    }),
  ])

  const titles = await courseTitles([...approaching, ...expired])

  await notifyAndStamp(CourseAssignment, approaching, 'deadlineReminderSentAt', now, (assignment) => ({
    userId: assignment.userId,
    type: 'COURSE_DEADLINE_APPROACHING',
    vars: {
      courseTitle: titles.get(assignment.courseId.toString()) ?? '',
      deadline: formatNotificationDate(assignment.deadline),
      daysLeft: daysUntil(assignment.deadline, now),
    },
    relatedEntityType: 'Course',
    relatedEntityId: assignment.courseId.toString(),
    severity: 'WARNING',
  }))

  await notifyAndStamp(CourseAssignment, expired, 'expiryReminderSentAt', now, (assignment) => ({
    userId: assignment.userId,
    type: 'COURSE_EXPIRED',
    vars: {
      courseTitle: titles.get(assignment.courseId.toString()) ?? '',
      deadline: formatNotificationDate(assignment.deadline),
    },
    relatedEntityType: 'Course',
    relatedEntityId: assignment.courseId.toString(),
    severity: 'WARNING',
  }))

  await notifyAndStamp(Task, approachingTasks, 'deadlineReminderSentAt', now, (task) => ({
    userId: task.assignedTo,
    type: 'TASK_DEADLINE_APPROACHING',
    vars: {
      taskTitle: task.title,
      deadline: formatNotificationDate(task.deadline),
      daysLeft: daysUntil(task.deadline, now),
    },
    relatedEntityType: 'Task',
    relatedEntityId: task._id.toString(),
    severity: 'WARNING',
  }))

  await notifyAndStamp(Task, overdueTasks, 'overdueReminderSentAt', now, (task) => ({
    userId: task.assignedTo,
    type: 'TASK_OVERDUE',
    vars: { taskTitle: task.title, deadline: formatNotificationDate(task.deadline) },
    relatedEntityType: 'Task',
    relatedEntityId: task._id.toString(),
    severity: 'WARNING',
  }))

  // Events ride the same sweep rather than getting a queue of their own:
  // it already runs every fifteen minutes, which is the granularity an
  // event reminder needs, and a second scheduler would be another job
  // waking a shared 1.9 GB box on its own timetable.
  const events = await eventService.sendDueReminders({ now }).catch((error) => {
    logger.warn('Event reminder sweep failed', { error: error.message })
    return { reminders: 0 }
  })

  // Path reminders are per path, not per sweep: each builder sets its own
  // "N days before" and "N days after" (rasm: Bildirishnomalar).
  const paths = await sendPathDeadlineReminders({ now }).catch((error) => {
    logger.warn('Path reminder sweep failed', { error: error.message })
    return { before: 0, after: 0 }
  })

  const counts = {
    pathBefore: paths.before,
    pathAfter: paths.after,
    approaching: approaching.length,
    expired: expired.length,
    approachingTasks: approachingTasks.length,
    overdueTasks: overdueTasks.length,
    eventReminders: events.reminders,
  }
  logger.info('Deadline reminder check completed', counts)
  return counts
}
