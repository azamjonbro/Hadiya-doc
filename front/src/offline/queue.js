import { STORES, idb, isOfflineStorageAvailable } from './db.js'

/**
 * Work that happened offline and the server has not seen yet (12.3).
 *
 * Before this, a flush that failed was **lost**: the player's
 * `fetch(...).catch(() => {})` dropped five minutes of watched video the
 * moment a lift or a basement took the connection. Now the failed request
 * is kept and replayed, and every video event carries a `clientEventId`
 * so replaying it cannot count twice (AT-35).
 *
 * What is queued: only requests that are **safe to repeat**. Video events
 * are deduplicated by the unique index on `(userId, clientEventId)`;
 * lesson blocks are a set, a material page is a maximum, a completion is
 * idempotent by construction. Nothing that creates a record is queued here
 * — that is what `Idempotency-Key` (11.5) is for, and those are deliberate
 * actions a person watches happen rather than background telemetry.
 */

// Give up after this many tries. A request that has failed twenty times is
// not going to succeed on the twenty-first, and a queue that never drops
// anything is a queue that grows until the browser evicts the whole
// database — losing the *good* items with it.
export const MAX_ATTEMPTS = 20

// Nothing older than this is worth sending: progress from three weeks ago
// tells nobody anything, and the server's own analytics window is longer
// than any useful queue.
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const SYNC_TAG = 'qollanma-offline-queue'

let flushing = false
const listeners = new Set()

function notify(size) {
  for (const listener of listeners) listener(size)
}

/** Called by the UI to show "N changes not sent yet". */
export function onQueueChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function queueSize() {
  if (!isOfflineStorageAvailable()) return 0
  try {
    return (await idb.keys(STORES.queue)).length
  } catch {
    return 0
  }
}

/**
 * Puts one request in the queue.
 *
 * @param {object} item
 * @param {string} item.id — stable and unique per attempt-worthy piece of
 *   work; reusing it means "this is the same work", which is what makes
 *   enqueueing idempotent too.
 */
export async function enqueue({ id, url, method = 'POST', body = null, kind = 'REQUEST' }) {
  if (!isOfflineStorageAvailable()) return false
  try {
    await idb.put(STORES.queue, id, { id, url, method, body, kind, createdAt: Date.now(), attempts: 0 })
    notify(await queueSize())
    return true
  } catch {
    // Storage refused (private window, quota): the work is lost, which is
    // exactly what happened before this existed — no worse.
    return false
  }
}

/**
 * Whether a failed attempt is worth repeating.
 *
 * A 4xx will not change on a retry — a rejected body stays rejected, and
 * 401/403 mean the session or the permission is gone. Keeping those would
 * make the queue an infinite loop against a server that has already
 * answered. A network error or a 5xx is exactly what a retry is for.
 */
export function isRetryable(status) {
  if (status == null) return true // no response at all: the network
  if (status === 408 || status === 429) return true
  return status >= 500
}

/**
 * Sends what is queued, oldest first.
 *
 * Order matters: a "lesson finished" sent before the blocks that justify
 * it is refused by the server (it checks the reader actually got there),
 * so the queue is drained in the order the work happened.
 */
export async function flushQueue({ authToken, apiBase, fetchImpl = fetch } = {}) {
  if (!isOfflineStorageAvailable() || flushing) return { sent: 0, kept: 0, dropped: 0 }
  if (!authToken) return { sent: 0, kept: 0, dropped: 0, skipped: 'NO_SESSION' }

  flushing = true
  let sent = 0
  let kept = 0
  let dropped = 0
  try {
    const items = (await idb.getAll(STORES.queue)).sort((a, b) => a.createdAt - b.createdAt)
    for (const item of items) {
      if (Date.now() - item.createdAt > MAX_AGE_MS || item.attempts >= MAX_ATTEMPTS) {
        await idb.del(STORES.queue, item.id)
        dropped += 1
        continue
      }

      let status = null
      try {
        const response = await fetchImpl(`${apiBase}${item.url}`, {
          method: item.method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: item.body ? JSON.stringify(item.body) : undefined,
        })
        status = response.status
      } catch {
        status = null
      }

      if (status != null && status < 400) {
        await idb.del(STORES.queue, item.id)
        sent += 1
        continue
      }
      if (!isRetryable(status)) {
        // The server has answered and will answer the same way again.
        await idb.del(STORES.queue, item.id)
        dropped += 1
        continue
      }
      await idb.put(STORES.queue, item.id, { ...item, attempts: item.attempts + 1, lastStatus: status })
      kept += 1
      // Stop at the first thing that could not be sent: the rest is
      // younger work, and sending it out of order is how a completion
      // arrives before the progress that earned it.
      break
    }
  } finally {
    flushing = false
    notify(await queueSize())
  }
  return { sent, kept, dropped }
}

/**
 * Asks the browser to wake us when the connection is back.
 *
 * **What Background Sync can and cannot do here.** The service worker
 * receives the `sync` event even with no tab open, but every endpoint on
 * this API needs a Bearer token that lives in the page, not in the
 * worker — so the worker cannot send the queue itself. What it does is
 * message any open client to flush, and when there is none, the queue
 * goes out the next time the app is opened. Storing a token in the worker
 * to close that gap would mean keeping a credential in a place that
 * outlives the session, which is a bad trade for telemetry.
 */
export async function registerBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker?.ready
    await registration?.sync?.register(SYNC_TAG)
    return true
  } catch {
    // Not supported (Safari), or refused. The `online` listener and the
    // flush on open cover the same ground, a little later.
    return false
  }
}

export const _internals = { SYNC_TAG }
