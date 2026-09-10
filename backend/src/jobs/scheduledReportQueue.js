import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const SCHEDULED_REPORT_QUEUE = 'scheduled-reports'
export const SCHEDULED_REPORT_SCHEDULER_ID = 'hourly-scheduled-reports'

export const scheduledReportQueue = new Queue(SCHEDULED_REPORT_QUEUE, { connection: redisConnection })

/**
 * Registers the hourly sweep (8.4).
 *
 * Hourly, because an hour is the finest granularity a schedule can ask for —
 * a report is chosen to arrive at 07:00, never at 07:15. Sweeping more often
 * would be more wake-ups on a shared box for a resolution nobody can select.
 *
 * upsertJobScheduler, not `add({ repeat })`: BullMQ 6 removed `repeat` from
 * Queue.add and ignores it silently, which is how the deadline reminders
 * once ended up running exactly once per worker start.
 */
export function scheduleReportSweep() {
  return scheduledReportQueue.upsertJobScheduler(
    SCHEDULED_REPORT_SCHEDULER_ID,
    { every: 60 * 60 * 1000 },
    { name: 'run-due-reports' }
  )
}
