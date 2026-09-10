import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'
import { env } from '../config/env.js'

export const MEDIA_CLEANUP_QUEUE = 'media-cleanup'

export const mediaCleanupQueue = new Queue(MEDIA_CLEANUP_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // One attempt: a sweep that failed halfway has already deleted what it
    // deleted, and the next scheduled run picks up where it stopped. A
    // retry would only re-walk five buckets for nothing.
    attempts: 1,
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 60 },
  },
})

/**
 * Nightly, after the backup window.
 *
 * 04:40 local: the backup runs at 03:20 and a sweep that deletes objects
 * while the night's copy is being taken would put the two in a race for the
 * same bytes.
 */
export function scheduleMediaCleanup() {
  return mediaCleanupQueue.upsertJobScheduler(
    'nightly-media-cleanup',
    { pattern: "40 4 * * *", tz: env.APP_TIMEZONE },
    { name: 'sweep', data: { apply: env.MEDIA_CLEANUP_DELETE } }
  )
}
