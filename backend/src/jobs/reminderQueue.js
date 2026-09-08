import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const REMINDER_QUEUE = 'reminders'
export const REMINDER_SCHEDULER_ID = 'check-deadlines'

export const reminderQueue = new Queue(REMINDER_QUEUE, { connection: redisConnection })

/**
 * Registers the recurring deadline check.
 *
 * upsertJobScheduler, not `add({ repeat })`: BullMQ 6 removed `repeat` from
 * Queue.add and does not complain about it — the option is ignored and one
 * ordinary job is queued instead. That is what this schedule used to do, so
 * deadline reminders ran once per worker start and never again.
 *
 * Upsert is what makes this safe to call on every boot: an existing
 * scheduler under the same id is updated in place rather than duplicated.
 */
export function scheduleReminderChecks() {
  return reminderQueue.upsertJobScheduler(
    REMINDER_SCHEDULER_ID,
    { every: 15 * 60 * 1000 },
    { name: 'check-deadlines' }
  )
}
