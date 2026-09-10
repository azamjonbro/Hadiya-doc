// 11.2 — webhooks.
//
// The tests are about the three things that make a webhook trustworthy
// rather than about CRUD:
//
//   - the receiver can prove the delivery came from us, and cannot be
//     tricked by a replay or by a body that was edited in transit;
//   - the platform cannot be aimed at its own network — the endpoint URL is
//     operator-supplied and the request leaves from inside, which is the
//     definition of an SSRF primitive, and this box also runs six other
//     sites on loopback;
//   - a delivery is at-least-once with a bounded retry, and the *record* of
//     what happened survives whatever the receiver did — including a
//     receiver that never answered.
//
// The receiver here is a real HTTP server on loopback, not a stubbed fetch:
// the signature, the headers and the timeout only mean anything end to end,
// and a fake `fetch` would have happily passed an implementation that
// signs the wrong string.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Webhook } from '../src/models/webhook.model.js'
import { WebhookDelivery } from '../src/models/webhookDelivery.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { webhookService, emitWebhookEvent } from '../src/services/integrations/webhook.service.js'
import { webhookDeliveryService } from '../src/services/integrations/webhookDelivery.service.js'
import {
  ATTEMPT_HEADER,
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  signPayload,
  verifySignature,
} from '../src/services/integrations/webhookSignature.js'
import { parseTargetUrl, assertResolvableTarget } from '../src/services/integrations/webhookTarget.js'
import { WEBHOOK_EVENTS, unknownEvents, buildEnvelope } from '../src/services/integrations/webhookEvents.js'
import { redisConnection } from '../src/config/redis.js'
import { webhookQueue } from '../src/jobs/webhookQueue.js'

const stamp = String(Date.now()).slice(-9)
let admin
let receiver
let receiverUrl
const userIds = []
const webhookIds = []

// What the receiver does next: set per test.
let handler = () => ({ status: 200, body: 'ok' })
const received = []

const actor = () => ({ id: admin._id.toString(), roleName: 'SUPERADMIN', permissions: [] })

async function makeWebhook(overrides = {}) {
  const created = await webhookService.create(actor(), {
    name: `Probe ${stamp}`,
    url: receiverUrl,
    events: ['course.completed'],
    ...overrides,
  })
  webhookIds.push(new mongoose.Types.ObjectId(created.id))
  return created
}

/** One attempt, run the way the worker runs it. */
function deliver(deliveryId, { attempt = 1, isFinal = false } = {}) {
  return webhookDeliveryService.attempt(String(deliveryId), { attempt, isFinal })
}

describe('11.2 · webhooks', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')
    admin = await User.create({
      firstName: 'Hook',
      lastName: 'Admin',
      fullName: 'Hook Admin',
      jshshir: `23${stamp}001`,
      passwordHash: await hashPassword('HookTest123!'),
      roleId: role._id,
      branch: `hook-branch-${stamp}`,
      department: 'IT',
    })
    userIds.push(admin._id)

    receiver = http.createServer((req, res) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', async () => {
        const body = Buffer.concat(chunks).toString()
        received.push({ headers: req.headers, body })
        const answer = await handler({ headers: req.headers, body })
        if (answer === 'hang') return // never responds — the timeout case
        res.writeHead(answer.status, { 'content-type': 'text/plain', ...(answer.headers ?? {}) })
        res.end(answer.body ?? '')
      })
    })
    await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    receiverUrl = `http://127.0.0.1:${receiver.address().port}/hook`
  })

  after(async () => {
    // Only the jobs this suite queued, by id — never `obliterate`: the
    // queue lives in a Redis this machine shares with the running app, and
    // a real pending delivery is not ours to throw away.
    const queued = await WebhookDelivery.find({ webhookId: { $in: webhookIds } }, { _id: 1 }).lean()
    await Promise.all(queued.map((row) => webhookQueue.remove(`wh-${row._id}`).catch(() => {})))
    await WebhookDelivery.deleteMany({ webhookId: { $in: webhookIds } })
    await AuditLog.deleteMany({ entity: 'Webhook', entityId: { $in: webhookIds.map(String) } })
    await Webhook.deleteMany({ _id: { $in: webhookIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    // Jobs this suite queued would otherwise be delivered by a real worker
    // hours later, against rows that no longer exist.
    await webhookQueue.close()
    await new Promise((resolve) => receiver.close(resolve))
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the signature', () => {
    test('the timestamp is signed, so a captured delivery cannot be replayed later', () => {
      const secret = 'whsec_test'
      const body = JSON.stringify({ event: 'course.completed' })
      const { header, timestamp } = signPayload({ secret, body })

      assert.equal(verifySignature({ secret, body, header }), true)
      // Six minutes later the same header is refused — and the attacker
      // cannot move the timestamp, because it is inside the MAC.
      assert.equal(verifySignature({ secret, body, header, now: Date.now() + 6 * 60_000 }), false)
      const forged = header.replace(`t=${timestamp}`, `t=${timestamp + 6 * 60}`)
      assert.equal(verifySignature({ secret, body, header: forged, now: Date.now() + 6 * 60_000 }), false)
    })

    test('a body edited in transit fails, and so does the wrong secret', () => {
      const body = JSON.stringify({ completionPercent: 100 })
      const { header } = signPayload({ secret: 'whsec_a', body })
      assert.equal(verifySignature({ secret: 'whsec_a', body: JSON.stringify({ completionPercent: 10 }), header }), false)
      assert.equal(verifySignature({ secret: 'whsec_b', body, header }), false)
      assert.equal(verifySignature({ secret: 'whsec_a', body, header: 'garbage' }), false)
    })

    test('the delivery a receiver actually gets verifies with the secret it was given', async () => {
      const created = await makeWebhook()
      received.length = 0
      handler = () => ({ status: 200, body: 'ok' })

      const { queued } = await emitWebhookEvent('course.completed', {
        user: admin,
        course: { _id: new mongoose.Types.ObjectId(), title: 'Mehnat xavfsizligi', slug: 'mehnat' },
        completionPercent: 100,
      })
      assert.equal(queued, 1)
      const delivery = await WebhookDelivery.findOne({ webhookId: created.id }).lean()
      // The job this emit queued is taken out of the queue before the send:
      // a real worker running on this machine would otherwise deliver the
      // same row a second time and the receiver would see two requests.
      await webhookQueue.remove(`wh-${delivery._id}`).catch(() => {})
      await deliver(delivery._id)

      const hits = received.filter((row) => row.headers[DELIVERY_HEADER] === delivery._id.toString())
      assert.equal(hits.length, 1)
      const hit = hits[0]
      // The whole point: the receiver's own check passes on what arrived.
      assert.equal(
        verifySignature({ secret: created.secret, body: hit.body, header: hit.headers[SIGNATURE_HEADER] }),
        true
      )
      assert.equal(hit.headers[EVENT_HEADER], 'course.completed')
      assert.equal(hit.headers[DELIVERY_HEADER], delivery._id.toString())
      // So a receiver can tell a retry from a second event.
      assert.equal(hit.headers[ATTEMPT_HEADER], '1')

      const envelope = JSON.parse(hit.body)
      assert.equal(envelope.event, 'course.completed')
      assert.equal(envelope.id, delivery._id.toString())
      assert.equal(envelope.data.completionPercent, 100)
      assert.equal(envelope.data.user.fullName, 'Hook Admin')
      // Identifiers never travel to a third-party endpoint, whatever the
      // subscription — unlike the public API, where a key can be granted
      // them explicitly.
      assert.equal(envelope.data.user.jshshir, undefined)
      assert.equal(envelope.data.user.email, undefined)
    })

    test('the secret can be rotated in place, keeping the endpoint and its history', async () => {
      const created = await makeWebhook()
      const rotated = await webhookService.rotateSecret(actor(), created.id)
      assert.notEqual(rotated.secret, created.secret)
      assert.match(rotated.secret, /^whsec_/)
      // Same row: the events, the URL and the delivery log belong to the
      // endpoint, not to the secret.
      assert.equal(rotated.id, created.id)
      const listed = (await webhookService.list()).find((row) => row.id === created.id)
      assert.equal(listed.secret, undefined)
    })
  })

  describe('where a webhook may point', () => {
    test('loopback, private ranges and cloud metadata are refused', () => {
      const refused = [
        'https://127.0.0.1/hook',
        'https://10.1.2.3/hook',
        'https://192.168.0.9/hook',
        'https://172.20.0.4/hook',
        // The one that matters most: the instance-metadata address is how
        // an SSRF becomes cloud credentials.
        'https://169.254.169.254/latest/meta-data/',
        'https://[::1]/hook',
        'https://localhost/hook',
        // Tailscale's range — this deployment is reachable on it.
        'https://100.66.216.16/hook',
      ]
      for (const url of refused) {
        assert.throws(() => parseTargetUrl(url, { allowPrivate: false }), { code: 'WEBHOOK_URL_PRIVATE' }, url)
      }
      assert.ok(parseTargetUrl('https://hooks.example.com/lms', { allowPrivate: false }))
    })

    test('http is refused in production, and credentials in the URL always', () => {
      // The delivery carries a signature and a body naming who finished
      // what; over http every hop between here and there can read it.
      assert.throws(() => parseTargetUrl('http://hooks.example.com', { allowPrivate: false }), {
        code: 'WEBHOOK_URL_NOT_HTTPS',
      })
      assert.throws(() => parseTargetUrl('https://user:pw@hooks.example.com', { allowPrivate: false }), {
        code: 'WEBHOOK_URL_HAS_CREDENTIALS',
      })
      assert.throws(() => parseTargetUrl('not-a-url', { allowPrivate: false }), { code: 'INVALID_WEBHOOK_URL' })
    })

    test('a name that resolves to a private address is refused at send time', async () => {
      const url = parseTargetUrl('https://rebind.example.com/hook', { allowPrivate: false })
      // Public: fine.
      await assertResolvableTarget(url, { allowPrivate: false, resolve: async () => [{ address: '93.184.216.34' }] })
      // One public and one private answer is the interesting case, not an
      // accident — checking only the first address is the bypass.
      await assert.rejects(
        () =>
          assertResolvableTarget(url, {
            allowPrivate: false,
            resolve: async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }],
          }),
        { code: 'WEBHOOK_URL_PRIVATE' }
      )
      await assert.rejects(
        () => assertResolvableTarget(url, { allowPrivate: false, resolve: async () => [] }),
        { code: 'WEBHOOK_URL_UNRESOLVABLE' }
      )
    })

    test('a redirect is not success — the signed request does not follow it', async () => {
      const created = await makeWebhook()
      handler = () => ({ status: 302, body: '', headers: { location: 'http://169.254.169.254/' } })
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      // Following it would take a request signed with the endpoint's secret
      // to a URL nobody approved.
      await assert.rejects(() => deliver(delivery._id, { isFinal: true }))
      const row = await WebhookDelivery.findById(delivery._id).lean()
      assert.equal(row.status, 'FAILED')
      assert.equal(row.responseStatus, 302)
    })
  })

  describe('the event catalogue', () => {
    test('only catalogued events can be subscribed to', async () => {
      await assert.rejects(() => makeWebhook({ events: ['course.everything'] }), { code: 'UNKNOWN_WEBHOOK_EVENT' })
      await assert.rejects(() => makeWebhook({ events: [] }), { code: 'NO_WEBHOOK_EVENTS' })
      // No wildcard: an endpoint subscribed to "everything" would silently
      // start receiving events invented after it was written.
      assert.deepEqual(unknownEvents(['*']), ['*'])
      assert.deepEqual(unknownEvents(WEBHOOK_EVENTS), [])
    })

    test('an event nobody subscribed to queues nothing', async () => {
      await makeWebhook({ events: ['course.completed'] })
      const result = await emitWebhookEvent('user.deactivated', { user: admin })
      assert.equal(result.queued, 0)
    })

    test('emitting never throws — a receiver is not allowed to fail a learner', async () => {
      // An unknown event name is our bug, not the operator's: it is logged
      // loudly and returns, rather than raising inside somebody's course
      // completion.
      const result = await emitWebhookEvent('nonsense.event', { user: admin })
      assert.deepEqual(result, { queued: 0 })
    })

    test('two endpoints on one event get a row each, not a shared one', async () => {
      const a = await makeWebhook({ events: ['user.created'] })
      const b = await makeWebhook({ events: ['user.created'] })
      const { queued } = await emitWebhookEvent('user.created', { user: admin })
      assert.equal(queued, 2)
      // Independent rows: two receivers fail independently, and a shared
      // attempt counter would retry a delivery that already arrived at one.
      const rows = await WebhookDelivery.find({
        webhookId: { $in: [a.id, b.id] },
        event: 'user.created',
      }).lean()
      assert.equal(rows.length, 2)
      assert.equal(new Set(rows.map((row) => String(row.webhookId))).size, 2)
    })

    test('the envelope tells the receiver how to deduplicate', () => {
      const occurredAt = new Date('2026-09-10T08:00:00.000Z')
      const envelope = buildEnvelope({ id: 'abc', event: 'course.completed', data: { x: 1 }, occurredAt })
      // At-least-once by construction: a 200 that never reaches us is
      // retried, so the id is the receiver's only defence against acting
      // twice — and `occurredAt` is when it happened, not when we resent it.
      assert.deepEqual(envelope, {
        id: 'abc',
        event: 'course.completed',
        occurredAt: '2026-09-10T08:00:00.000Z',
        data: { x: 1 },
      })
    })
  })

  describe('delivery, retry and the record of what happened', () => {
    test('a 2xx marks it delivered and records how long the receiver took', async () => {
      const created = await makeWebhook()
      handler = () => ({ status: 204, body: '' })
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      const result = await deliver(delivery._id)
      assert.equal(result.delivered, true)

      const row = await WebhookDelivery.findById(delivery._id).lean()
      assert.equal(row.status, 'DELIVERED')
      assert.equal(row.attempts, 1)
      assert.equal(row.responseStatus, 204)
      assert.ok(row.deliveredAt)
      assert.ok(row.durationMs >= 0)
      const endpoint = await Webhook.findById(created.id).lean()
      assert.equal(endpoint.lastStatus, 204)
      assert.equal(endpoint.consecutiveFailures, 0)
    })

    test('a 500 throws — which is how the queue is told to retry — and keeps the body', async () => {
      const created = await makeWebhook()
      handler = () => ({ status: 500, body: 'Internal Server Error: column "x" does not exist' })
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      // Returning instead of throwing would mark the job complete and the
      // receiver would never get the event.
      await assert.rejects(() => deliver(delivery._id, { attempt: 1, isFinal: false }))

      const row = await WebhookDelivery.findById(delivery._id).lean()
      // Still PENDING: attempts remain.
      assert.equal(row.status, 'PENDING')
      assert.equal(row.attempts, 1)
      assert.equal(row.responseStatus, 500)
      // The receiver's own error is almost always the reason, so it is
      // worth keeping — clipped, so an HTML error page cannot become the
      // largest collection in the database.
      assert.match(row.responseBody, /column "x" does not exist/)
      assert.ok(row.responseBody.length <= 400)
    })

    test('the last attempt is what turns it into FAILED', async () => {
      const created = await makeWebhook()
      handler = () => ({ status: 503, body: 'down' })
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      await assert.rejects(() => deliver(delivery._id, { attempt: 5, isFinal: true }))
      const row = await WebhookDelivery.findById(delivery._id).lean()
      assert.equal(row.status, 'FAILED')
      // And only a final failure counts against the endpoint — counting
      // every attempt would reach the automatic stop five times faster.
      const endpoint = await Webhook.findById(created.id).lean()
      assert.equal(endpoint.consecutiveFailures, 1)
    })

    test('a receiver that accepts the connection and never answers is a failure, not a hang', async () => {
      const created = await makeWebhook()
      handler = () => 'hang'
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      // Without the timeout this worker slot would be held indefinitely.
      // WEBHOOK_TIMEOUT_MS is 8s by default; the test runs with 1s.
      const started = Date.now()
      await assert.rejects(() => deliver(delivery._id, { isFinal: true }))
      assert.ok(Date.now() - started < 20_000)
      const row = await WebhookDelivery.findById(delivery._id).lean()
      assert.equal(row.status, 'FAILED')
      assert.equal(row.responseStatus, null)
      assert.match(row.error, /abort|timeout|timed out/i)
    })

    test('a success resets the failure count rather than decrementing it', async () => {
      const created = await makeWebhook()
      await Webhook.updateOne({ _id: created.id }, { $set: { consecutiveFailures: 7 } })
      handler = () => ({ status: 200, body: 'ok' })
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      await deliver(delivery._id)
      const endpoint = await Webhook.findById(created.id).lean()
      // An endpoint that works is not "less broken": a receiver with an
      // occasional bad day must never walk towards the automatic stop.
      assert.equal(endpoint.consecutiveFailures, 0)
    })

    test('an endpoint that has failed too many times switches itself off', async () => {
      const created = await makeWebhook()
      const limit = webhookDeliveryService._internals.FAILURE_LIMIT
      await Webhook.updateOne({ _id: created.id }, { $set: { consecutiveFailures: limit - 1 } })
      handler = () => ({ status: 500, body: 'still down' })
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      await assert.rejects(() => deliver(delivery._id, { attempt: 5, isFinal: true }))

      const endpoint = await Webhook.findById(created.id).lean()
      // Past this point the receiver is not having a bad minute, it is
      // gone, and every further event only queues attempts that will fail.
      assert.equal(endpoint.active, false)
      assert.ok(endpoint.disabledAt)
      assert.match(endpoint.disabledReason, /in a row/)

      // Nothing is queued for a disabled endpoint any more. Counted for
      // this endpoint alone — the suite leaves other subscriptions on the
      // same event standing, which is the realistic case anyway.
      const before = await WebhookDelivery.countDocuments({ webhookId: created.id })
      await emitWebhookEvent('course.completed', {
        user: admin,
        course: { _id: new mongoose.Types.ObjectId(), title: 'x', slug: 'x' },
      })
      assert.equal(await WebhookDelivery.countDocuments({ webhookId: created.id }), before)

      // And turning it back on clears the stop, or it would disable itself
      // again on the first event after being fixed.
      const reenabled = await webhookService.update(actor(), created.id, { active: true })
      assert.equal(reenabled.consecutiveFailures, 0)
      assert.equal(reenabled.disabledAt, null)
    })

    test('a delivery queued for an endpoint disabled in the meantime is not sent', async () => {
      const created = await makeWebhook()
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      await webhookService.update(actor(), created.id, { active: false })
      received.length = 0
      const result = await deliver(delivery._id)
      // The operator's decision wins over a job already in flight.
      assert.equal(result.skipped, 'WEBHOOK_INACTIVE')
      assert.equal(received.length, 0)
      assert.equal((await WebhookDelivery.findById(delivery._id).lean()).status, 'FAILED')
    })

    test('a delivery already delivered is never sent twice by a duplicate job', async () => {
      const created = await makeWebhook()
      handler = () => ({ status: 200, body: 'ok' })
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: null },
        occurredAt: new Date(),
      })
      await deliver(delivery._id)
      received.length = 0
      const again = await deliver(delivery._id)
      assert.equal(again.skipped, 'ALREADY_DELIVERED')
      assert.equal(received.length, 0)
    })
  })

  describe('replaying what a receiver missed', () => {
    test('a replay is a new row pointing at the old one', async () => {
      const created = await makeWebhook()
      handler = () => ({ status: 500, body: 'down' })
      const original = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: { user: { id: 'u1', fullName: 'Was true then' }, completionPercent: 100 },
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
      })
      await assert.rejects(() => deliver(original._id, { attempt: 5, isFinal: true }))

      const replay = await webhookService.replay(actor(), original._id.toString())
      assert.equal(replay.replayOf, original._id.toString())
      // The failure stays in the record: "we tried, it was down, we resent
      // it on Tuesday" is the answer to the support question, and
      // overwriting the first attempt erases it.
      assert.equal((await WebhookDelivery.findById(original._id).lean()).status, 'FAILED')

      const row = await WebhookDelivery.findById(replay.id).lean()
      // The payload is copied, not rebuilt: a replay resends what the
      // receiver missed, not what today's data would say.
      assert.deepEqual(row.payload, original.payload)
      assert.equal(row.occurredAt.toISOString(), '2026-09-01T10:00:00.000Z')
      assert.equal(row.status, 'PENDING')
    })

    test('a disabled endpoint cannot be replayed into', async () => {
      const created = await makeWebhook()
      const delivery = await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: {},
        occurredAt: new Date(),
      })
      await webhookService.update(actor(), created.id, { active: false })
      await assert.rejects(() => webhookService.replay(actor(), delivery._id.toString()), {
        code: 'WEBHOOK_INACTIVE',
      })
    })

    test('deleting a subscription takes its deliveries with it', async () => {
      const created = await makeWebhook()
      await WebhookDelivery.create({
        webhookId: created.id,
        event: 'course.completed',
        payload: {},
        occurredAt: new Date(),
      })
      await webhookService.remove(actor(), created.id)
      assert.equal(await Webhook.countDocuments({ _id: created.id }), 0)
      // They are diagnostics for an endpoint that no longer exists, and
      // they name it in every row.
      assert.equal(await WebhookDelivery.countDocuments({ webhookId: created.id }), 0)
      const audit = await AuditLog.find({ entity: 'Webhook', entityId: created.id }).lean()
      assert.deepEqual(
        audit.map((row) => row.action).sort(),
        ['WEBHOOK_CREATED', 'WEBHOOK_DELETED']
      )
    })

    test('the delivery log can be read per endpoint and per status', async () => {
      const created = await makeWebhook()
      await WebhookDelivery.create([
        { webhookId: created.id, event: 'course.completed', payload: {}, occurredAt: new Date(), status: 'DELIVERED' },
        { webhookId: created.id, event: 'course.completed', payload: {}, occurredAt: new Date(), status: 'FAILED' },
      ])
      const failed = await webhookService.deliveries({ webhookId: created.id, status: 'FAILED' })
      assert.equal(failed.length, 1)
      assert.equal(failed[0].status, 'FAILED')
      const all = await webhookService.deliveries({ webhookId: created.id, limit: 10 })
      assert.equal(all.length, 2)
    })
  })
})
