// Web push (1.7) — subscriptions, and the rules for throwing one away.
//
// The interesting behaviour is all in the failure handling. A subscription
// is issued by the browser vendor and revoked by the browser vendor; we can
// only store it and stop using it when told. Deleting one for the wrong
// reason means someone silently stops getting notifications and has no way
// to know, so "when is a subscription dead" is asserted case by case:
//
//   404 / 410  the vendor says it is gone           -> delete
//   500, timeout, offline phone                     -> keep, count
//   20 consecutive non-permanent failures           -> delete anyway
//
// The push itself is not sent to a real vendor — that would need a browser.
// web-push's network call is stubbed, and everything around it is real.

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import webpush from 'web-push'

process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || webpush.generateVAPIDKeys().publicKey
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
if (!process.env.VAPID_PRIVATE_KEY) {
  const pair = webpush.generateVAPIDKeys()
  process.env.VAPID_PUBLIC_KEY = pair.publicKey
  process.env.VAPID_PRIVATE_KEY = pair.privateKey
}
process.env.VAPID_SUBJECT = 'mailto:test@example.uz'

const { connectDatabase } = await import('../src/config/db.js')
const { PushSubscription } = await import('../src/models/pushSubscription.model.js')
const { pushService, isPushConfigured } = await import('../src/services/notifications/push.service.js')

const USER_A = new mongoose.Types.ObjectId()
const USER_B = new mongoose.Types.ObjectId()

const subscriptionFor = (name) => ({
  endpoint: `https://push.example.test/${name}`,
  keys: { p256dh: 'BNc'.padEnd(87, 'x'), auth: 'abcd'.padEnd(22, 'y') },
})

// Replaces only the network call; everything the service does around it —
// the queries, the pruning rules, the counters — runs for real.
const realSend = webpush.sendNotification
function stubSend(behaviour) {
  webpush.sendNotification = async (subscription, payload) => behaviour(subscription, payload)
}

describe('web push', () => {
  before(async () => {
    await connectDatabase()
    await PushSubscription.deleteMany({ userId: { $in: [USER_A, USER_B] } })
  })

  after(async () => {
    webpush.sendNotification = realSend
    await PushSubscription.deleteMany({ userId: { $in: [USER_A, USER_B] } })
    await mongoose.connection.close()
  })

  beforeEach(async () => {
    webpush.sendNotification = realSend
    await PushSubscription.deleteMany({ userId: { $in: [USER_A, USER_B] } })
  })

  test('keys generated for this run are recognised as configured', () => {
    assert.equal(isPushConfigured(), true)
  })

  test('subscribing stores the browser\'s endpoint and keys', async () => {
    await pushService.subscribe(USER_A, { ...subscriptionFor('a1'), userAgent: 'Chrome/142' })
    const [row] = await pushService.list(USER_A)
    assert.equal(row.endpoint, 'https://push.example.test/a1')
    assert.equal(row.keys.p256dh.length, 87)
    assert.equal(row.userAgent, 'Chrome/142')
    assert.equal(row.failureCount, 0)
  })

  test('re-subscribing the same browser updates rather than duplicating', async () => {
    // Browsers re-subscribe on their own schedule — after a permission
    // reset, a service-worker update, a vendor key rotation. Each of those
    // would otherwise leave a row that gets pushed to twice.
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    assert.equal((await pushService.list(USER_A)).length, 1)
  })

  test('re-subscribing clears a failure count — the browser is telling us it is alive', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    await PushSubscription.updateOne({ endpoint: 'https://push.example.test/a1' }, { $set: { failureCount: 7 } })
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    const [row] = await pushService.list(USER_A)
    assert.equal(row.failureCount, 0)
  })

  test('the same endpoint arriving for another account follows the person at the keyboard', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('shared'))
    await pushService.subscribe(USER_B, subscriptionFor('shared'))
    assert.equal((await pushService.list(USER_A)).length, 0)
    assert.equal((await pushService.list(USER_B)).length, 1)
  })

  test('one account cannot unsubscribe another\'s browser by quoting its endpoint', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    const removed = await pushService.unsubscribe(USER_B, 'https://push.example.test/a1')
    assert.equal(removed, 0)
    assert.equal((await pushService.list(USER_A)).length, 1)
  })

  test('unsubscribing with no endpoint clears every browser for that account', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    await pushService.subscribe(USER_A, subscriptionFor('a2'))
    assert.equal(await pushService.unsubscribe(USER_A), 2)
    assert.equal((await pushService.list(USER_A)).length, 0)
  })

  test('a push reaches every browser the person has', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    await pushService.subscribe(USER_A, subscriptionFor('a2'))
    const seen = []
    stubSend(async (subscription, payload) => {
      seen.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) })
      return { statusCode: 201 }
    })

    const result = await pushService.sendToUser(USER_A, { title: 'Yangi kurs', body: 'Mehnat xavfsizligi' })
    assert.equal(result.sent, 2)
    assert.equal(result.removed, 0)
    assert.equal(seen.length, 2)
    assert.equal(seen[0].payload.title, 'Yangi kurs')
    assert.equal(seen[0].payload.body, 'Mehnat xavfsizligi')
  })

  test('a success stamps lastSuccessAt and resets the failure count', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    await PushSubscription.updateOne({ endpoint: 'https://push.example.test/a1' }, { $set: { failureCount: 3 } })
    stubSend(async () => ({ statusCode: 201 }))
    await pushService.sendToUser(USER_A, { title: 'x' })
    const [row] = await pushService.list(USER_A)
    assert.ok(row.lastSuccessAt instanceof Date)
    assert.equal(row.failureCount, 0)
  })

  for (const status of [404, 410]) {
    test(`a ${status} from the vendor means the subscription is gone, so it is deleted`, async () => {
      await pushService.subscribe(USER_A, subscriptionFor('a1'))
      stubSend(async () => {
        const error = new Error('gone')
        error.statusCode = status
        throw error
      })
      const result = await pushService.sendToUser(USER_A, { title: 'x' })
      assert.equal(result.removed, 1)
      assert.equal((await pushService.list(USER_A)).length, 0)
    })
  }

  test('a temporary failure keeps the subscription and counts it', async () => {
    // A phone in a lift is not a revoked permission. Deleting here means
    // someone silently stops getting notifications with no way to notice.
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    stubSend(async () => {
      const error = new Error('service unavailable')
      error.statusCode = 503
      throw error
    })
    const result = await pushService.sendToUser(USER_A, { title: 'x' })
    assert.equal(result.removed, 0)
    const [row] = await pushService.list(USER_A)
    assert.equal(row.failureCount, 1)
  })

  test('but an endpoint that has failed twenty times in a row is pruned', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('a1'))
    await PushSubscription.updateOne({ endpoint: 'https://push.example.test/a1' }, { $set: { failureCount: 19 } })
    stubSend(async () => {
      const error = new Error('service unavailable')
      error.statusCode = 503
      throw error
    })
    const result = await pushService.sendToUser(USER_A, { title: 'x' })
    assert.equal(result.removed, 1)
    assert.equal((await pushService.list(USER_A)).length, 0)
  })

  test('one dead browser does not stop the others being pushed', async () => {
    await pushService.subscribe(USER_A, subscriptionFor('dead'))
    await pushService.subscribe(USER_A, subscriptionFor('alive'))
    stubSend(async (subscription) => {
      if (subscription.endpoint.endsWith('dead')) {
        const error = new Error('gone')
        error.statusCode = 410
        throw error
      }
      return { statusCode: 201 }
    })
    const result = await pushService.sendToUser(USER_A, { title: 'x' })
    assert.equal(result.sent, 1)
    assert.equal(result.removed, 1)
  })

  test('someone with no subscriptions is not an error', async () => {
    assert.deepEqual(await pushService.sendToUser(USER_B, { title: 'x' }), { sent: 0, removed: 0 })
  })
})
