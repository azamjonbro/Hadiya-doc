import { Webhook } from '../../models/webhook.model.js'
import { WebhookDelivery } from '../../models/webhookDelivery.model.js'
import { buildEnvelope } from './webhookEvents.js'
import {
  ATTEMPT_HEADER,
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  signPayload,
} from './webhookSignature.js'
import { assertResolvableTarget, parseTargetUrl } from './webhookTarget.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { errorMessage } from '../../utils/errorMessage.js'

/**
 * The send itself (11.2).
 *
 * Separated from `webhook.service.js` because this is the only part that
 * touches the network, and the only part a test wants to replace. `fetchImpl`
 * is injectable for exactly that reason — the same house pattern as
 * `{ storage = defaultStorage() }` in the upload services.
 */

// How much of a receiver's response is worth keeping. Enough for "502 Bad
// Gateway" or a validation message; not enough for an HTML error page to
// dominate the collection.
const RESPONSE_SNIPPET = 400

// Consecutive failures before an endpoint is switched off. Twenty is
// roughly four events' worth of full retry cycles: past that the receiver
// is not having a bad minute, it is gone, and every further event only
// queues five attempts that will all fail.
const FAILURE_LIMIT = 20

async function readSnippet(response) {
  try {
    const text = await response.text()
    return text.slice(0, RESPONSE_SNIPPET)
  } catch {
    return ''
  }
}

export const webhookDeliveryService = {
  /**
   * Performs one attempt.
   *
   * **Throws when the attempt failed**, which is how BullMQ is told to
   * retry — returning a value would mark the job complete and the receiver
   * would never get the event. The `attempt` argument is the attempt now
   * running (BullMQ's `attemptsMade` counts the ones already finished), and
   * `isFinal` is what turns a still-retrying delivery into a FAILED one.
   */
  async attempt(deliveryId, { attempt = 1, isFinal = false, fetchImpl = fetch } = {}) {
    const delivery = await WebhookDelivery.findById(deliveryId)
    // Deliveries expire after 30 days; a job that outlived its row has
    // nothing to send and must not be retried.
    if (!delivery) return { skipped: 'DELIVERY_GONE' }
    if (delivery.status === 'DELIVERED') return { skipped: 'ALREADY_DELIVERED' }

    const webhook = await Webhook.findById(delivery.webhookId)
    if (!webhook) {
      await WebhookDelivery.updateOne(
        { _id: delivery._id },
        { $set: { status: 'FAILED', error: 'The subscription was deleted' } }
      )
      return { skipped: 'WEBHOOK_GONE' }
    }
    // An endpoint switched off between queueing and sending: the operator's
    // decision wins over a job already in flight.
    if (!webhook.active) {
      await WebhookDelivery.updateOne(
        { _id: delivery._id },
        { $set: { status: 'FAILED', error: 'The subscription was disabled before this could be sent' } }
      )
      return { skipped: 'WEBHOOK_INACTIVE' }
    }

    const body = JSON.stringify(
      buildEnvelope({
        id: delivery._id.toString(),
        event: delivery.event,
        data: delivery.payload,
        occurredAt: delivery.occurredAt,
      })
    )

    const startedAt = Date.now()
    let response
    let failure = ''
    try {
      // Re-checked on every attempt, not once at subscription time: a name
      // that resolved publicly when the endpoint was added can resolve to
      // loopback now, and this request carries a signature.
      const url = parseTargetUrl(webhook.url)
      await assertResolvableTarget(url)

      const { header } = signPayload({ secret: webhook.secret, body })
      response = await fetchImpl(url.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Qollanma-Webhooks/1.0',
          [SIGNATURE_HEADER]: header,
          [EVENT_HEADER]: delivery.event,
          [DELIVERY_HEADER]: delivery._id.toString(),
          // So a receiver can tell a retry from a second event, and log
          // accordingly rather than alerting twice.
          [ATTEMPT_HEADER]: String(attempt),
          ...Object.fromEntries(webhook.headers ?? []),
        },
        body,
        // Without a timeout a receiver that accepts the connection and
        // never answers holds a worker slot indefinitely.
        signal: AbortSignal.timeout(env.WEBHOOK_TIMEOUT_MS),
        redirect: 'manual',
      })
    } catch (error) {
      failure = errorMessage(error)
    }

    const durationMs = Date.now() - startedAt
    // 2xx only. A 3xx is not success: following a redirect would take the
    // signed request to a URL nobody approved, so `redirect: 'manual'`
    // above stops it and the endpoint is reported as misconfigured.
    const ok = Boolean(response && response.status >= 200 && response.status < 300)
    const snippet = response && !ok ? await readSnippet(response) : ''

    await WebhookDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: ok ? 'DELIVERED' : isFinal ? 'FAILED' : 'PENDING',
          responseStatus: response?.status ?? null,
          responseBody: snippet,
          error: ok ? '' : failure || `HTTP ${response?.status}`,
          durationMs,
          deliveredAt: ok ? new Date() : null,
        },
        $inc: { attempts: 1 },
      }
    )

    if (ok) {
      // Reset rather than decrement: an endpoint that works is not "less
      // broken", and a receiver with an occasional bad minute should never
      // walk towards the automatic stop.
      await Webhook.updateOne(
        { _id: webhook._id },
        { $set: { consecutiveFailures: 0, lastDeliveryAt: new Date(), lastStatus: response.status } }
      )
      return { delivered: true, status: response.status, durationMs }
    }

    // Only a *final* failure counts against the endpoint. Counting every
    // attempt would reach twenty after four dead events instead of twenty.
    if (isFinal) {
      const updated = await Webhook.findOneAndUpdate(
        { _id: webhook._id },
        {
          $inc: { consecutiveFailures: 1 },
          $set: { lastDeliveryAt: new Date(), lastStatus: response?.status ?? null },
        },
        { new: true }
      )
      if (updated && updated.consecutiveFailures >= FAILURE_LIMIT && updated.active) {
        await Webhook.updateOne(
          { _id: webhook._id },
          {
            $set: {
              active: false,
              disabledAt: new Date(),
              disabledReason: `${FAILURE_LIMIT} deliveries in a row failed`,
            },
          }
        )
        logger.warn('Webhook disabled after repeated failures', {
          webhookId: String(webhook._id),
          name: webhook.name,
        })
      }
    }

    // Throwing is the retry signal for BullMQ.
    throw new Error(failure || `The endpoint answered ${response?.status}`)
  },

  _internals: { FAILURE_LIMIT, RESPONSE_SNIPPET },
}
