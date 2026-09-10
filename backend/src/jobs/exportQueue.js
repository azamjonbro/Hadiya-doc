import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const EXPORT_QUEUE = 'exports'
export const EXPORT_CLEANUP_SCHEDULER_ID = 'daily-export-cleanup'

export const exportQueue = new Queue(EXPORT_QUEUE, { connection: redisConnection })

/**
 * Queues one report build.
 *
 * `attempts: 2` rather than the usual five: a failing export is almost
 * always a bad filter or a report type that no longer exists, and retrying
 * a full-company aggregation four more times is how a shared box falls
 * over on somebody's typo.
 *
 * The custom job id is what makes queueing the same export twice a no-op.
 * It is joined with a dash, not a colon: BullMQ namespaces its Redis keys
 * with colons and rejects a custom id containing one — which it does by
 * throwing at add() time, so every request to this route answered 500 and
 * no export was ever built.
 */
export function queueExport(jobId) {
  return exportQueue.add(
    'build',
    { jobId: String(jobId) },
    {
      jobId: `export-${jobId}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  )
}

/**
 * Removes the stored files of expired jobs.
 *
 * The document has a TTL index, but Mongo's TTL monitor only deletes the
 * row — it knows nothing about the object in storage. Without this, every
 * export ever run stays in the bucket after its row is gone, which is both
 * a bill and a pile of stale copies of the staff list.
 */
export function scheduleExportCleanup() {
  return exportQueue.upsertJobScheduler(
    EXPORT_CLEANUP_SCHEDULER_ID,
    { every: 24 * 60 * 60 * 1000 },
    { name: 'cleanup' }
  )
}
