// 12.3 — the offline queue's rules.
//
// The IndexedDB half runs in a browser (CDP); what is tested here is the
// part that decides *behaviour*: which failures are worth repeating, and
// which are the server having already answered. Getting that wrong is not
// a visible bug — it is a queue that either loops forever against a 403 or
// throws away work on the first hiccup.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_AGE_MS, MAX_ATTEMPTS, isRetryable } from '../src/offline/queue.js'

describe('12.3 · what the queue retries', () => {
  test('no response at all is the case the queue exists for', () => {
    // A lift, a basement, a dropped Wi-Fi: the request never reached the
    // server, so the work is still undone.
    assert.equal(isRetryable(null), true)
    assert.equal(isRetryable(undefined), true)
  })

  test('a server that failed is worth asking again', () => {
    assert.equal(isRetryable(500), true)
    assert.equal(isRetryable(502), true)
    assert.equal(isRetryable(503), true)
    // Rate limited and request timeout: both say "later", explicitly.
    assert.equal(isRetryable(429), true)
    assert.equal(isRetryable(408), true)
  })

  test('a server that answered will answer the same way again', () => {
    // Retrying these is an infinite loop against a decision already made:
    // a rejected body stays rejected, and 401/403 mean the session or the
    // permission is gone.
    assert.equal(isRetryable(400), false)
    assert.equal(isRetryable(401), false)
    assert.equal(isRetryable(403), false)
    assert.equal(isRetryable(404), false)
    assert.equal(isRetryable(409), false)
    assert.equal(isRetryable(422), false)
  })

  test('anything sent is not retried', () => {
    assert.equal(isRetryable(200), false)
    assert.equal(isRetryable(204), false)
  })

  test('the ceilings are bounded, and bounded for a reason', () => {
    // A queue that never drops anything grows until the browser evicts the
    // whole database — taking the good items with it.
    assert.ok(MAX_ATTEMPTS > 0 && MAX_ATTEMPTS <= 50)
    // And progress from three weeks ago tells nobody anything.
    assert.equal(MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000)
  })
})
