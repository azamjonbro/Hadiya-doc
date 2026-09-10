// 11.5 — `Idempotency-Key`.
//
// The case being tested is not a careless client. It is the ordinary one: a
// request that **succeeded** and whose response never arrived — signal lost
// at the wrong moment, a proxy timeout, a laptop closed mid-submit. The
// client cannot distinguish that from a request that never landed, so it
// retries, and the question these tests answer is whether the retry files a
// second homework submission or gets the first answer back.
//
// The middleware runs inside a real express app over real HTTP against the
// real Redis this deployment uses — the store *is* the mechanism here
// (SET NX is what makes two concurrent retries safe), so a fake one would
// be testing nothing.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { idempotent, idempotencyScope, REPLAY_HEADER } from '../src/middlewares/idempotency.middleware.js'
import { errorHandler } from '../src/middlewares/error.middleware.js'
import { sendSuccess } from '../src/utils/apiResponse.js'
import { redisConnection } from '../src/config/redis.js'

let server
let base
// Who the fake `authenticate` says we are, and what the handler does.
let actor = { id: 'user-a' }
let handlerCalls = 0
let nextStatus = 201
let failWith = null
// Makes the handler slow enough for a second request to arrive while the
// first is genuinely still running — otherwise the "concurrent" retry lands
// after completion and gets the replay, which is a different branch.
let delayMs = 0

const KEYS = new Set()

/** POST with an optional key; returns status, body and the replay marker. */
async function post(path, body, key, { as } = {}) {
  if (as) actor = { id: as }
  if (key) KEYS.add(key)
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
      ...(as ? { 'x-test-user': as } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  return {
    status: response.status,
    replay: response.headers.get(REPLAY_HEADER),
    retryAfter: response.headers.get('retry-after'),
    body: await response.json(),
  }
}

describe('11.5 · Idempotency-Key', () => {
  before(async () => {
    const app = express()
    app.use(express.json())
    // A stand-in for `authenticate`: the scope includes the actor, and
    // that is one of the properties under test.
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-test-user'] ?? actor.id }
      next()
    })

    app.post('/things/:id/do', idempotent(), async (req, res) => {
      handlerCalls += 1
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
      if (failWith) {
        // A 500 out of the handler, the way a real failure arrives.
        res.status(500).json({ success: false, message: failWith, code: 'BOOM', data: null })
        return
      }
      sendSuccess(res, { id: `created-${handlerCalls}`, echoed: req.body }, 'Created', nextStatus)
    })

    // A second route, to prove a key is scoped to the operation.
    app.post('/other', idempotent(), (req, res) => {
      handlerCalls += 1
      sendSuccess(res, { where: 'other' }, 'Created', 201)
    })

    app.post('/strict', idempotent({ required: true }), (req, res) => {
      handlerCalls += 1
      sendSuccess(res, { ok: true }, 'Created', 201)
    })

    app.use(errorHandler)

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    // Only this suite's keys, by their scope — never a FLUSHDB: this Redis
    // is shared with the running app and six neighbour sites.
    const scopes = []
    for (const key of KEYS) {
      for (const user of ['user-a', 'user-b']) {
        for (const route of [
          { method: 'POST', baseUrl: '', route: { path: '/things/:id/do' }, params: { id: 'thing-1' } },
          { method: 'POST', baseUrl: '', route: { path: '/things/:id/do' }, params: { id: 'thing-2' } },
          { method: 'POST', baseUrl: '', route: { path: '/other' }, params: {} },
          { method: 'POST', baseUrl: '', route: { path: '/strict' }, params: {} },
        ]) {
          scopes.push(idempotencyScope({ ...route, user: { id: user }, ip: '127.0.0.1' }, key))
        }
      }
    }
    if (scopes.length) await redisConnection.del(...scopes)
    await new Promise((resolve) => server.close(resolve))
    redisConnection.disconnect()
  })

  describe('a retry of a request that already succeeded', () => {
    test('gets the first response back, and the handler runs once', async () => {
      handlerCalls = 0
      const key = `k-replay-${Date.now()}`
      const first = await post('/things/thing-1/do', { note: 'hello' }, key)
      const second = await post('/things/thing-1/do', { note: 'hello' }, key)

      assert.equal(first.status, 201)
      assert.equal(first.replay, null)
      // The whole point: one record created, not two.
      assert.equal(handlerCalls, 1)
      assert.equal(second.status, 201)
      assert.deepEqual(second.body, first.body)
      // And the client is told it is a replay, so a UI can tell "created"
      // from "already created" if it wants to.
      assert.equal(second.replay, 'true')
    })

    test('two concurrent retries: one runs, the other is told to wait', async () => {
      handlerCalls = 0
      const key = `k-race-${Date.now()}`
      delayMs = 250
      // Fired together, which is exactly what a client with a retry timer
      // and a slow first request does.
      const [a, b] = await Promise.all([
        post('/things/thing-1/do', { note: 'race' }, key),
        post('/things/thing-1/do', { note: 'race' }, key),
      ])
      const statuses = [a.status, b.status].sort()
      assert.deepEqual(statuses, [201, 409])
      // Check-then-set would have let both through; SET NX is what makes
      // this a 409 instead of two records.
      assert.equal(handlerCalls, 1)
      const conflict = a.status === 409 ? a : b
      assert.equal(conflict.body.code, 'IDEMPOTENCY_IN_PROGRESS')
      delayMs = 0
      // Told when to come back rather than held open, which would tie up a
      // connection for as long as the first request takes.
      assert.equal(conflict.retryAfter, '1')
    })

    test('the same key with a different body is refused, not silently replayed', async () => {
      handlerCalls = 0
      const key = `k-reuse-${Date.now()}`
      await post('/things/thing-1/do', { note: 'first' }, key)
      const second = await post('/things/thing-1/do', { note: 'changed' }, key)
      assert.equal(second.status, 409)
      assert.equal(second.body.code, 'IDEMPOTENCY_KEY_REUSED')
      // Replaying the first answer would tell the second request's author
      // their payload was accepted when it never ran.
      assert.equal(handlerCalls, 1)
    })

    test('field order in the body is not a different request', async () => {
      handlerCalls = 0
      const key = `k-order-${Date.now()}`
      const first = await post('/things/thing-1/do', { a: 1, b: 2 }, key)
      const second = await post('/things/thing-1/do', { b: 2, a: 1 }, key)
      // Without a stable fingerprint this would be IDEMPOTENCY_KEY_REUSED,
      // which is a confusing answer to an identical request.
      assert.equal(second.status, first.status)
      assert.equal(second.replay, 'true')
      assert.equal(handlerCalls, 1)
    })
  })

  describe('what a key is scoped to', () => {
    test('another person reusing the same string gets their own operation', async () => {
      handlerCalls = 0
      const key = `k-shared-${Date.now()}`
      const mine = await post('/things/thing-1/do', { note: 'mine' }, key, { as: 'user-a' })
      const theirs = await post('/things/thing-1/do', { note: 'theirs' }, key, { as: 'user-b' })
      // A key is a string the client chose; without the actor in the scope
      // one person's key would replay another's response to them.
      assert.equal(theirs.replay, null)
      assert.equal(handlerCalls, 2)
      assert.notDeepEqual(theirs.body.data, mine.body.data)
    })

    test('the same key on a different endpoint is a different operation', async () => {
      handlerCalls = 0
      const key = `k-route-${Date.now()}`
      await post('/things/thing-1/do', {}, key, { as: 'user-a' })
      const elsewhere = await post('/other', {}, key, { as: 'user-a' })
      // Replaying the stored body here would answer a question nobody
      // asked.
      assert.equal(elsewhere.replay, null)
      assert.equal(elsewhere.body.data.where, 'other')
      assert.equal(handlerCalls, 2)
    })

    test('the same key on a different record is a different operation', async () => {
      handlerCalls = 0
      const key = `k-params-${Date.now()}`
      await post('/things/thing-1/do', {}, key, { as: 'user-a' })
      const other = await post('/things/thing-2/do', {}, key, { as: 'user-a' })
      // `/courses/:id/assignments` for two courses is two operations, so
      // the path parameters are part of the scope.
      assert.equal(other.replay, null)
      assert.equal(handlerCalls, 2)
    })
  })

  describe('which answers are worth remembering', () => {
    test('a 5xx is not stored, so the retry can actually run', async () => {
      handlerCalls = 0
      const key = `k-fail-${Date.now()}`
      failWith = 'the database blinked'
      const first = await post('/things/thing-1/do', { note: 'transient' }, key)
      assert.equal(first.status, 500)

      failWith = null
      const retry = await post('/things/thing-1/do', { note: 'transient' }, key)
      // Cementing a transient failure into the answer for the next 24
      // hours would break the exact case this middleware exists for.
      assert.equal(retry.status, 201)
      assert.equal(retry.replay, null)
      assert.equal(handlerCalls, 2)
    })

    test('a 4xx is stored, because it is deterministic', async () => {
      handlerCalls = 0
      const key = `k-4xx-${Date.now()}`
      failWith = null
      // 422 the way a validation refusal or a duplicate-key conflict
      // arrives at the client.
      nextStatus = 422
      const first = await post('/things/thing-1/do', { note: 'invalid' }, key)
      const second = await post('/things/thing-1/do', { note: 'invalid' }, key)
      assert.equal(first.status, 422)
      assert.equal(second.status, 422)
      // Replaying it keeps a broken client from hammering the endpoint,
      // and the answer would not change anyway.
      assert.equal(second.replay, 'true')
      assert.equal(handlerCalls, 1)
      nextStatus = 201
    })
  })

  describe('the header itself', () => {
    test('no header means the endpoint behaves exactly as before', async () => {
      handlerCalls = 0
      const a = await post('/things/thing-1/do', { note: 'no key' })
      const b = await post('/things/thing-1/do', { note: 'no key' })
      // Adding idempotency to an endpoint must not break the clients
      // already calling it.
      assert.equal(a.status, 201)
      assert.equal(b.status, 201)
      assert.equal(handlerCalls, 2)
    })

    test('an endpoint can require it', async () => {
      handlerCalls = 0
      const missing = await post('/strict', {})
      assert.equal(missing.status, 400)
      assert.equal(missing.body.code, 'IDEMPOTENCY_KEY_REQUIRED')
      assert.equal(handlerCalls, 0)
      const withKey = await post('/strict', {}, `k-strict-${Date.now()}`)
      assert.equal(withKey.status, 201)
    })

    test('an absurdly long key is refused rather than stored', async () => {
      const long = 'x'.repeat(300)
      const response = await post('/things/thing-1/do', {}, long)
      // Otherwise the header is free storage in somebody else's Redis.
      assert.equal(response.status, 400)
      assert.equal(response.body.code, 'IDEMPOTENCY_KEY_INVALID')
    })
  })

  describe('the scope function', () => {
    test('is stable for the same request and differs on every axis that matters', () => {
      const req = {
        method: 'POST',
        baseUrl: '/api/v1/courses',
        route: { path: '/:id/assignments' },
        params: { id: 'c1' },
        user: { id: 'u1' },
        ip: '1.2.3.4',
      }
      assert.equal(idempotencyScope(req, 'k'), idempotencyScope(req, 'k'))
      assert.notEqual(idempotencyScope(req, 'k'), idempotencyScope(req, 'k2'))
      assert.notEqual(idempotencyScope(req, 'k'), idempotencyScope({ ...req, user: { id: 'u2' } }, 'k'))
      assert.notEqual(idempotencyScope(req, 'k'), idempotencyScope({ ...req, params: { id: 'c2' } }, 'k'))
      assert.notEqual(idempotencyScope(req, 'k'), idempotencyScope({ ...req, method: 'DELETE' }, 'k'))
      // An API key caller is scoped by its prefix, not lumped in with
      // anonymous traffic by IP.
      const keyed = { ...req, user: undefined, apiKey: { prefix: 'lms_abcd1234' } }
      assert.notEqual(idempotencyScope(keyed, 'k'), idempotencyScope({ ...req, user: undefined }, 'k'))
    })
  })
})
