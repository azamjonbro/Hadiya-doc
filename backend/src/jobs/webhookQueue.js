import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.js'
import { logger } from '../config/logger.js'

export const WEBHOOK_QUEUE = 'webhook-delivery'

/**
 * Delivery attempts (11.2).
 *
 * **Five attempts, exponential from 10 seconds** — 10s, 40s, ~2.5m, ~10m,
 * ~40m, so a receiver that is being restarted or redeployed gets the event
 * without anybody intervening, and one that is genuinely down is given up
 * on inside an hour instead of retried for a day.
 *
 * Retrying at all is not optional: the receiver is somebody else's server
 * on somebody else's network, and the single most common failure is a
 * deploy that was in progress when we called. Retrying *forever* is just
 * as wrong — an event from yesterday delivered tomorrow is usually worse
 * for the receiver than one never delivered, because their state has moved
 * on.
 *
 * `backoff.type: 'exponential'` doubles, so the multiplier is `delay *
 * 2^(attempt-1)`.
 */
export const webhookQueue = new Queue(WEBHOOK_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 },
    // The delivery row is the record; the job is just the intent to try.
    // Keeping thousands of finished jobs in Redis to duplicate what Mongo
    // already holds is how a 1.9 GB box runs out of memory.
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
})

/**
 * Queue one delivery.
 *
 * Never throws. A webhook is a side effect of somebody's real work — a
 * learner finishing a course, an admin assigning one — and a Redis outage
 * must not turn that into a failed request. The event is lost rather than
 * the action, which is the right way round: the delivery row and the log
 * both record that it happened.
 */
export function queueWebhookDelivery(deliveryId) {
  return webhookQueue
    .add('deliver', { deliveryId: String(deliveryId) }, { jobId: `wh-${deliveryId}` })
    .catch((error) => {
      logger.error('Could not queue a webhook delivery', { deliveryId: String(deliveryId), error: error.message })
      return null
    })
}
