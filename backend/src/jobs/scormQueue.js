import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const SCORM_QUEUE = 'scorm-extract'

export const scormQueue = new Queue(SCORM_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // Two attempts, not three: extraction is deterministic — a package that
    // fails to unpack fails the same way every time, and the one failure
    // worth retrying is a storage hiccup mid-upload.
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
  },
})

export function enqueueScormExtraction(packageId) {
  return scormQueue.add('extract', { packageId: String(packageId) })
}
