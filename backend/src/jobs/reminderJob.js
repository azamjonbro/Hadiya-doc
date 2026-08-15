import { CourseAssignment } from '../models/courseAssignment.model.js'
import { Course } from '../models/course.model.js'
import { Task } from '../models/task.model.js'
import { notificationService } from '../services/notifications/notification.service.js'
import { logger } from '../config/logger.js'

const DEADLINE_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000

export async function runDeadlineChecks() {
  const now = new Date()
  const soon = new Date(now.getTime() + DEADLINE_WARNING_WINDOW_MS)

  const approaching = await CourseAssignment.find({
    status: 'ACTIVE',
    deadline: { $gte: now, $lte: soon },
    deadlineReminderSentAt: null,
  })
  for (const assignment of approaching) {
    const course = await Course.findById(assignment.courseId)
    await notificationService.notify({
      userId: assignment.userId,
      type: 'COURSE_DEADLINE_APPROACHING',
      title: `Deadline approaching: ${course?.title ?? 'Course'}`,
      message: `Due ${assignment.deadline.toLocaleDateString()}`,
      relatedEntityType: 'Course',
      relatedEntityId: assignment.courseId.toString(),
      severity: 'WARNING',
    })
    assignment.deadlineReminderSentAt = now
    await assignment.save()
  }

  const expired = await CourseAssignment.find({
    status: 'ACTIVE',
    expiresAt: { $lte: now },
    expiryReminderSentAt: null,
  })
  for (const assignment of expired) {
    const course = await Course.findById(assignment.courseId)
    await notificationService.notify({
      userId: assignment.userId,
      type: 'COURSE_EXPIRED',
      title: `Course access expired: ${course?.title ?? 'Course'}`,
      relatedEntityType: 'Course',
      relatedEntityId: assignment.courseId.toString(),
      severity: 'WARNING',
    })
    assignment.expiryReminderSentAt = now
    await assignment.save()
  }

  const approachingTasks = await Task.find({
    status: { $in: ['TODO', 'IN_PROGRESS'] },
    deadline: { $gte: now, $lte: soon },
    deadlineReminderSentAt: null,
  })
  for (const task of approachingTasks) {
    await notificationService.notify({
      userId: task.assignedTo,
      type: 'TASK_DEADLINE_APPROACHING',
      title: `Task deadline approaching: ${task.title}`,
      message: `Due ${task.deadline.toLocaleDateString()}`,
      relatedEntityType: 'Task',
      relatedEntityId: task._id.toString(),
      severity: 'WARNING',
    })
    task.deadlineReminderSentAt = now
    await task.save()
  }

  const overdueTasks = await Task.find({
    status: { $in: ['TODO', 'IN_PROGRESS'] },
    deadline: { $lte: now },
    overdueReminderSentAt: null,
  })
  for (const task of overdueTasks) {
    await notificationService.notify({
      userId: task.assignedTo,
      type: 'TASK_OVERDUE',
      title: `Task overdue: ${task.title}`,
      relatedEntityType: 'Task',
      relatedEntityId: task._id.toString(),
      severity: 'WARNING',
    })
    task.overdueReminderSentAt = now
    await task.save()
  }

  logger.info('Deadline reminder check completed', {
    approaching: approaching.length,
    expired: expired.length,
    approachingTasks: approachingTasks.length,
    overdueTasks: overdueTasks.length,
  })

  return {
    approaching: approaching.length,
    expired: expired.length,
    approachingTasks: approachingTasks.length,
    overdueTasks: overdueTasks.length,
  }
}
