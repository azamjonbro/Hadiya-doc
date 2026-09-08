import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'
import { env } from '../config/env.js'

export const BACKUP_QUEUE = 'backups'
export const BACKUP_SCHEDULER_ID = 'nightly-backup'

export const backupQueue = new Queue(BACKUP_QUEUE, { connection: redisConnection })

/**
 * Registers (or removes) the nightly schedule.
 *
 * upsertJobScheduler, not `add({ repeat })`: BullMQ 6 dropped `repeat` from
 * `Queue.add` — it is accepted and silently produces one ordinary job, so a
 * schedule written the old way runs exactly once, at worker start.
 *
 * Turning BACKUP_ENABLED off has to remove the scheduler as well: it lives
 * in Redis, not in this file, and would otherwise keep firing against a
 * deployment that has since dropped its encryption key.
 */
export async function scheduleDailyBackup() {
  if (!env.BACKUP_ENABLED) {
    await backupQueue.removeJobScheduler(BACKUP_SCHEDULER_ID)
    return false
  }
  await backupQueue.upsertJobScheduler(
    BACKUP_SCHEDULER_ID,
    { pattern: env.BACKUP_SCHEDULE_CRON, tz: env.APP_TIMEZONE },
    {
      name: 'dump',
      opts: {
        // A dump that failed because Mongo was mid-restart deserves a couple
        // of tries; more than that and the next night's run is the retry.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5 * 60 * 1000 },
        removeOnComplete: 30,
        removeOnFail: 30,
      },
    }
  )
  return true
}
