import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { mailService } from '../services/notifications/mail.service.js'

export const DELIVERY_QUEUE = 'delivery'

export const deliveryQueue = new Queue(DELIVERY_QUEUE, { connection: redisConnection })

// Five attempts, doubling from 30s: ~30s, 1m, 2m, 4m — a little over seven
// minutes of trying. That covers what actually goes wrong with SMTP (a relay
// restarting, a rate limit, a brief DNS failure) without keeping a job alive
// for hours, by which point a password-reset link is useless anyway.
export const DELIVERY_ATTEMPTS = 5
const BACKOFF_MS = 30_000

/**
 * Queues one email.
 *
 * The MailLog row is written here, before the job exists, so a message is
 * recorded even if Redis drops the job — "we meant to send this" is the fact
 * worth keeping, and a queue is not a durable store.
 *
 * Callers never await delivery. Mail is the slowest and least reliable thing
 * the platform does, and no request may depend on it: notify() persists the
 * in-app notification and enqueues, and the two succeed or fail separately.
 */
export async function enqueueMail({ to, subject, text = '', html = null, templateKey = null, userId = null }) {
  const log = await mailService.createLog({ to, subject, templateKey, userId })
  await deliveryQueue.add(
    'mail',
    { logId: log._id.toString(), to, subject, text, html },
    {
      attempts: DELIVERY_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_MS },
      // Kept briefly for inspection; MailLog is the durable record, so the
      // queue does not need to double as one.
      removeOnComplete: 100,
      removeOnFail: 500,
    }
  )
  return log
}

/**
 * What to do when an attempt fails — shared by the worker and its test so
 * the "gave up" rule is verified as written, not as a copy of itself.
 *
 * BullMQ calls this after every failed attempt, including the ones it is
 * about to retry, so the permanent-failure record must only be written once
 * the attempts are actually exhausted. send() cannot make that call: it does
 * not know whether another attempt is coming.
 */
export async function handleDeliveryFailure(job, error) {
  const attempt = job?.attemptsMade ?? 0
  const exhausted = attempt >= DELIVERY_ATTEMPTS
  logger.error(exhausted ? 'Mail delivery gave up' : 'Mail delivery attempt failed', {
    jobId: job?.id,
    to: job?.data?.to,
    attempt,
    error: error.message,
  })
  if (!exhausted) return false
  await mailService.markFailed({
    logId: job?.data?.logId,
    attempts: attempt,
    error: error.message,
  })
  return true
}
