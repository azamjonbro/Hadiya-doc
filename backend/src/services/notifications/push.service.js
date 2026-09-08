import webpush from 'web-push'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { PushSubscription } from '../../models/pushSubscription.model.js'

/**
 * Web push, over VAPID.
 *
 * The payload is encrypted to keys the browser generated, so the vendor
 * relaying it (Google, Mozilla, Apple) carries ciphertext it cannot read.
 * That is the reason this is worth having at all for a platform that pushes
 * "you failed a compliance quiz" to people's phones.
 *
 * Off unless VAPID keys are configured, exactly like mail: a laptop and a
 * day-one install both have to work.
 */

// A subscription is dead when the vendor says so, and only then. 404 means
// the endpoint never existed, 410 that the browser revoked it — both are
// permanent and the row should go. Anything else (a timeout, a 500 at the
// vendor, a phone in a lift) is temporary and must not cost someone their
// subscription.
const GONE_STATUS_CODES = new Set([404, 410])

// After this many non-permanent failures in a row the row is pruned anyway:
// something is wrong with it that retrying will not fix, and an endpoint
// that has failed twenty times is costing a request per notification for
// nothing.
const MAX_CONSECUTIVE_FAILURES = 20

let configured = false

export function isPushConfigured() {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

function ensureConfigured() {
  if (!isPushConfigured()) return false
  if (!configured) {
    // The subject identifies us to the push service so it has someone to
    // contact about abuse. A mailto: is what the spec expects.
    webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.uz', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
    configured = true
  }
  return true
}

export const pushService = {
  /**
   * Stores (or re-stores) a browser's subscription.
   *
   * Upsert on the endpoint rather than insert: a browser re-subscribes on
   * its own schedule — after a permission reset, a service-worker update, a
   * vendor key rotation — and each of those would otherwise leave a
   * duplicate that gets pushed to twice. Re-subscribing also clears the
   * failure count, since this is the browser telling us it is alive.
   */
  async subscribe(userId, { endpoint, keys, userAgent = '' }) {
    return PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId, endpoint, keys, userAgent, failureCount: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  },

  /**
   * Removes one subscription, or all of this person's.
   *
   * Scoped by userId even when an endpoint is given: an endpoint is a
   * bearer-ish string, and one account must not be able to unsubscribe
   * another's browser by quoting it.
   */
  async unsubscribe(userId, endpoint) {
    const filter = endpoint ? { userId, endpoint } : { userId }
    const { deletedCount } = await PushSubscription.deleteMany(filter)
    return deletedCount
  },

  list(userId) {
    return PushSubscription.find({ userId }).sort({ createdAt: -1 }).lean()
  },

  /**
   * Pushes to every browser this person has registered.
   *
   * Returns what happened rather than throwing: the caller is notify(), and
   * a browser that has been reinstalled must not turn a course assignment
   * into an error.
   */
  async sendToUser(userId, { title, body = '', url = '', tag = '' }) {
    if (!ensureConfigured()) return { sent: 0, removed: 0, skipped: 'not-configured' }

    const subscriptions = await PushSubscription.find({ userId }).lean()
    if (!subscriptions.length) return { sent: 0, removed: 0 }

    const payload = JSON.stringify({ title, body, url, tag: tag || title })
    let sent = 0
    let removed = 0

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload
        )
        sent += 1
        await PushSubscription.updateOne(
          { _id: subscription._id },
          { $set: { lastSuccessAt: new Date(), failureCount: 0 } }
        )
      } catch (error) {
        const status = error.statusCode
        if (GONE_STATUS_CODES.has(status)) {
          await PushSubscription.deleteOne({ _id: subscription._id })
          removed += 1
          continue
        }
        const failures = (subscription.failureCount ?? 0) + 1
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          await PushSubscription.deleteOne({ _id: subscription._id })
          removed += 1
          logger.warn('Push subscription pruned after repeated failures', {
            userId: String(userId),
            failures,
            status,
          })
          continue
        }
        await PushSubscription.updateOne({ _id: subscription._id }, { $set: { failureCount: failures } })
        logger.warn('Push delivery failed', { userId: String(userId), status, error: error.message })
      }
    }

    return { sent, removed }
  },
}
