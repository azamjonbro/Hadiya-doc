import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const REMINDER_QUEUE = 'reminders'

export const reminderQueue = new Queue(REMINDER_QUEUE, { connection: redisConnection })

export function scheduleReminderChecks() {
  return reminderQueue.add(
    'check-deadlines',
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      // Stable jobId so restarting the worker doesn't register a duplicate
      // repeatable schedule.
      jobId: 'check-deadlines-repeat',
    }
  )
}
