import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'

export const CERTIFICATE_QUEUE = 'certificates'

export const certificateQueue = new Queue(CERTIFICATE_QUEUE, { connection: redisConnection })

/**
 * Queues the issue of a certificate for a completed course.
 *
 * On a queue rather than inline because rendering is a PDF, a font, a QR
 * code and an S3 upload, and the thing that triggers it is somebody
 * finishing a video. Nobody should wait for a certificate to be drawn to
 * find out their lesson was recorded.
 *
 * The jobId makes the *queueing* idempotent — evaluate() runs on every
 * write, so a learner who watches three more seconds of a finished course
 * would otherwise queue a job each time. Issuing is idempotent too, at the
 * database (AT-11); this only keeps the queue from filling with work that
 * will do nothing.
 */
export function queueCertificate(userId, courseId, { score = '' } = {}) {
  return certificateQueue.add(
    'issue',
    { userId: String(userId), courseId: String(courseId), score },
    {
      jobId: `course:${courseId}:${userId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  )
}
