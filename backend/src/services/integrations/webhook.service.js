import { Webhook } from '../../models/webhook.model.js'
import { WebhookDelivery } from '../../models/webhookDelivery.model.js'
import { WEBHOOK_EVENTS, unknownEvents, webhookPayloads } from './webhookEvents.js'
import { generateSecret } from './webhookSignature.js'
import { parseTargetUrl } from './webhookTarget.js'
import { queueWebhookDelivery } from '../../jobs/webhookQueue.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'
import { errorMessage } from '../../utils/errorMessage.js'

/**
 * Managing subscriptions, and emitting events into them (11.2).
 */

function toPublicWebhook(webhook, { secret } = {}) {
  return {
    id: webhook._id.toString(),
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    headers: Object.fromEntries(webhook.headers ?? []),
    active: webhook.active,
    consecutiveFailures: webhook.consecutiveFailures,
    disabledAt: webhook.disabledAt,
    disabledReason: webhook.disabledReason,
    lastDeliveryAt: webhook.lastDeliveryAt,
    lastStatus: webhook.lastStatus,
    createdAt: webhook.createdAt,
    // Only in the response that created or rotated it, like an API key.
    ...(secret ? { secret } : {}),
  }
}

function toPublicDelivery(row) {
  return {
    id: row._id.toString(),
    webhookId: String(row.webhookId),
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody,
    error: row.error,
    durationMs: row.durationMs,
    occurredAt: row.occurredAt,
    deliveredAt: row.deliveredAt,
    replayOf: row.replayOf ? String(row.replayOf) : null,
    createdAt: row.createdAt,
  }
}

function assertEvents(events) {
  const unknown = unknownEvents(events)
  if (unknown.length) {
    throw ApiError.badRequest(`Not events this platform sends: ${unknown.join(', ')}`, 'UNKNOWN_WEBHOOK_EVENT')
  }
  if (!events.length) {
    throw ApiError.badRequest('A subscription with no events would never fire', 'NO_WEBHOOK_EVENTS')
  }
}

export const webhookService = {
  events: () => WEBHOOK_EVENTS,

  async list() {
    const rows = await Webhook.find({}).sort({ createdAt: -1 })
    return rows.map((row) => toPublicWebhook(row))
  },

  async create(actor, { name, url, events = [], headers = {} }) {
    assertEvents(events)
    // Validated here, at the moment somebody is looking at the form —
    // rather than at send time, where the only evidence is a failed job.
    const target = parseTargetUrl(url)
    const secret = generateSecret()

    const webhook = await Webhook.create({
      name,
      url: target.toString(),
      secret,
      events,
      headers: new Map(Object.entries(headers)),
      createdBy: actor.id,
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'WEBHOOK_CREATED',
      entity: 'Webhook',
      entityId: webhook._id.toString(),
      metadata: { name, url: target.toString(), events },
    })

    return toPublicWebhook(webhook, { secret })
  },

  async update(actor, id, patch) {
    const webhook = await Webhook.findById(id)
    if (!webhook) throw ApiError.notFound('Subscription not found')

    if (patch.events) {
      assertEvents(patch.events)
      webhook.events = patch.events
    }
    if (patch.url) webhook.url = parseTargetUrl(patch.url).toString()
    if (patch.name) webhook.name = patch.name
    if (patch.headers) webhook.headers = new Map(Object.entries(patch.headers))
    if (patch.active !== undefined) {
      webhook.active = Boolean(patch.active)
      // Turning it back on clears the automatic stop, otherwise an endpoint
      // disabled by the failure counter would switch itself off again on
      // the first event after being fixed.
      if (webhook.active) {
        webhook.consecutiveFailures = 0
        webhook.disabledAt = null
        webhook.disabledReason = ''
      }
    }
    await webhook.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'WEBHOOK_UPDATED',
      entity: 'Webhook',
      entityId: String(id),
      metadata: { changed: Object.keys(patch) },
    })
    return toPublicWebhook(webhook)
  },

  /**
   * Issues a new signing secret.
   *
   * In place rather than as a create-and-delete: the events, the URL and
   * the delivery history belong to the endpoint, not to the secret. The
   * cost is a window where the receiver still verifies with the old one —
   * unavoidable with a single secret, and the reason the header carries a
   * `v1=` version marker for the day two are supported at once.
   */
  async rotateSecret(actor, id) {
    const webhook = await Webhook.findById(id)
    if (!webhook) throw ApiError.notFound('Subscription not found')
    const secret = generateSecret()
    webhook.secret = secret
    await webhook.save()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'WEBHOOK_SECRET_ROTATED',
      entity: 'Webhook',
      entityId: String(id),
      metadata: { name: webhook.name },
    })
    return toPublicWebhook(webhook, { secret })
  },

  async remove(actor, id) {
    const webhook = await Webhook.findById(id)
    if (!webhook) throw ApiError.notFound('Subscription not found')
    await Webhook.deleteOne({ _id: webhook._id })
    // The deliveries go with it: they are diagnostics for an endpoint that
    // no longer exists, and they name it in every row.
    await WebhookDelivery.deleteMany({ webhookId: webhook._id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'WEBHOOK_DELETED',
      entity: 'Webhook',
      entityId: String(id),
      metadata: { name: webhook.name, url: webhook.url },
    })
    return { id: String(id) }
  },

  async deliveries({ webhookId, status = '', limit = 50 }) {
    const filter = {}
    if (webhookId) filter.webhookId = webhookId
    if (status) filter.status = status
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const rows = await WebhookDelivery.find(filter).sort({ createdAt: -1 }).limit(take).lean()
    return rows.map(toPublicDelivery)
  },

  /**
   * Sends a stored delivery again.
   *
   * A new row rather than resetting the old one, and it carries `replayOf`:
   * the failure is part of the record — "we tried, it was down, we resent
   * it on Tuesday" is the answer to the support question, and overwriting
   * the first attempt erases it. The payload is copied, not rebuilt, so
   * the receiver gets the event as it was.
   */
  async replay(actor, deliveryId) {
    const original = await WebhookDelivery.findById(deliveryId).lean()
    if (!original) throw ApiError.notFound('Delivery not found')
    const webhook = await Webhook.findById(original.webhookId)
    if (!webhook) throw ApiError.notFound('Subscription not found')
    if (!webhook.active) {
      throw ApiError.badRequest('Turn the subscription back on first', 'WEBHOOK_INACTIVE')
    }

    const replay = await WebhookDelivery.create({
      webhookId: original.webhookId,
      event: original.event,
      payload: original.payload,
      occurredAt: original.occurredAt,
      replayOf: original._id,
    })
    await queueWebhookDelivery(replay._id)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'WEBHOOK_REPLAYED',
      entity: 'WebhookDelivery',
      entityId: replay._id.toString(),
      metadata: { event: original.event, original: String(original._id) },
    })
    return toPublicDelivery(replay)
  },

  /**
   * A test event, on request.
   *
   * Every webhook integration's first question is whether the endpoint is
   * reachable and the signature verifies, and the honest way to answer it
   * is to send something. `ping` is not in the catalogue precisely because
   * nothing subscribes to it — it goes to this endpoint alone.
   */
  async ping(actor, id) {
    const webhook = await Webhook.findById(id)
    if (!webhook) throw ApiError.notFound('Subscription not found')
    const delivery = await WebhookDelivery.create({
      webhookId: webhook._id,
      event: 'ping',
      payload: { message: 'Qo\'llanma webhook test', by: String(actor.id) },
      occurredAt: new Date(),
    })
    await queueWebhookDelivery(delivery._id)
    return toPublicDelivery(delivery)
  },
}

/**
 * Emits a domain event to every endpoint subscribed to it.
 *
 * **Never throws and is never awaited for its result by a request path.**
 * A webhook is a side effect of somebody's real work; a receiver's DNS
 * failure must not fail a learner's course completion. Errors land in the
 * log and the delivery row, not in the response.
 *
 * One row per subscription, not one shared row: two receivers fail
 * independently, and a shared attempt counter would retry a delivery that
 * already arrived at one of them.
 */
export async function emitWebhookEvent(event, context = {}) {
  try {
    const builder = webhookPayloads[event]
    if (!builder) {
      // A caller naming an event that is not in the catalogue is a bug in
      // our code, not in somebody's configuration — loud, not silent.
      logger.error('Unknown webhook event emitted', { event })
      return { queued: 0 }
    }

    const subscriptions = await Webhook.find({ active: true, events: event }, { _id: 1 }).lean()
    if (!subscriptions.length) return { queued: 0 }

    const payload = builder(context)
    const occurredAt = context.occurredAt ?? new Date()

    // Rows first, then jobs: a row with no job can be replayed by hand,
    // while a job with no row has nothing to send.
    const rows = await WebhookDelivery.insertMany(
      subscriptions.map((subscription) => ({
        webhookId: subscription._id,
        event,
        payload,
        occurredAt,
      }))
    )
    await Promise.all(rows.map((row) => queueWebhookDelivery(row._id)))
    return { queued: rows.length }
  } catch (error) {
    logger.error('Could not emit a webhook event', { event, error: errorMessage(error) })
    return { queued: 0, error: errorMessage(error) }
  }
}
