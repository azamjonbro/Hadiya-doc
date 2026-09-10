/**
 * A very small IndexedDB wrapper (12.2).
 *
 * No library. What this needs is four operations against four stores, and
 * the promise-wrapping is thirty lines — against a dependency that would
 * also have to be precached into every install. The parts that actually
 * matter here (what is stored, and what happens when the browser refuses
 * to store it) are not the parts a library helps with.
 */

const DB_NAME = 'qollanma-offline'
// v1: the four stores below. A bump here runs `onupgradeneeded`, which is
// also the only place a store can be created.
const DB_VERSION = 1

export const STORES = {
  // One record per saved course: its metadata and its table of contents,
  // so the course page can be drawn with no network at all.
  courses: 'courses',
  // Lesson blocks, keyed by lesson id.
  lessons: 'lessons',
  // Material metadata (name, mime, size) keyed by material id…
  materials: 'materials',
  // …and their bytes, in a separate store so listing what is saved does
  // not read hundreds of megabytes into memory.
  blobs: 'blobs',
}

let dbPromise = null

export function isOfflineStorageAvailable() {
  return typeof indexedDB !== 'undefined'
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    // A private window, or a browser with site data blocked. The caller
    // turns this into "offline saving is unavailable", not an error page.
    request.onerror = () => reject(request.error ?? new Error('IndexedDB is unavailable'))
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  })
  return dbPromise
}

function run(storeName, mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = work(store)
        // Resolve on the *transaction*, not the request: with `readwrite`
        // the write is only durable once the transaction commits, and
        // resolving earlier is how a "saved" message appears for data that
        // then fails to persist.
        transaction.oncomplete = () => resolve(request?.result)
        transaction.onerror = () => reject(transaction.error ?? request?.error)
        transaction.onabort = () => reject(transaction.error ?? new Error('The write was aborted'))
      })
  )
}

export const idb = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
  keys: (store) => run(store, 'readonly', (s) => s.getAllKeys()),
  put: (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key)),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
}

/**
 * How much room there is, as the browser sees it.
 *
 * `usage`/`quota` are both estimates and both can be absent. The caller
 * treats a missing answer as "go ahead": refusing to save because the
 * browser would not say how much room it has would be refusing on no
 * evidence.
 */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return { usage: null, quota: null, available: null }
  const { usage = null, quota = null } = await navigator.storage.estimate()
  return { usage, quota, available: usage != null && quota != null ? quota - usage : null }
}

/**
 * Asks the browser not to evict this data under pressure.
 *
 * Best-effort by design: Chrome grants it on a site the person uses,
 * Safari does not have it. Saving still works without it — the data is
 * simply evictable, which is the state everything was in before asking.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
