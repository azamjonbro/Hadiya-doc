/**
 * The service worker (12.1).
 *
 * Written by hand rather than generated from configuration, for two
 * reasons. The forced one: workbox's `generateSW` cannot build in this
 * repository — it string-concatenates absolute import paths inside single
 * quotes, and this checkout lives in a directory whose name contains an
 * apostrophe (`qo'llanma`), so the generated worker is not valid
 * JavaScript. The good one: the offline queue in 12.3 needs a worker
 * somebody can read and change.
 *
 * What it does and does not do is the whole design. It makes the app
 * **open** without a network — the shell, the fonts, the icons. It does
 * **not** cache the API: a cached course list is a course list that is
 * wrong, and a cached authenticated response is one that can be handed to
 * the next person on a shared machine. Taking content offline is a
 * deliberate act by the learner (12.2), stored per learner in IndexedDB.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Injected at build time by vite-plugin-pwa: the shell's hashed files.
precacheAndRoute(self.__WB_MANIFEST)
// Caches from a previous version of this worker, which are dead weight the
// moment the hashes change.
cleanupOutdatedCaches()

/**
 * Any navigation resolves to the shell, which then routes client-side —
 * except the paths that are not the SPA.
 *
 * Without the denylist the worker would answer a navigation to `/api/...`
 * with index.html: a request that should have failed loudly returns HTML
 * with status 200, which is the worst possible shape for a client to
 * debug. `/socket.io/` and the media prefixes are on the same host in
 * production.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/socket\.io\//, /^\/media\//, /^\/lms-/, /^\/openapi\.json$/],
  })
)

// Fonts: immutable, and the one thing whose absence makes an offline page
// look broken rather than plain.
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
)

// Our own images (icons, and the static art the SPA host serves).
registerRoute(
  ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

/**
 * The vendor folders — the face models and the PDF renderer — are tens of
 * megabytes, so they are **not** precached: installing the app must not
 * download features most people never open. They are cached the first time
 * somebody actually uses one, which is also when the wait is expected.
 */
registerRoute(
  ({ url }) =>
    /\/(mediapipe|pdfjs)\//.test(url.pathname) ||
    // The document viewers, excluded from the precache for the same
    // reason (see vite.config.js): about 4 MB of the build, each one
    // behind a single screen.
    /\/assets\/(pdf|pdf\.worker\.min|pptx-preview|exceljs\.min|mammoth\.browser)-[A-Za-z0-9_-]+\.js$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'vendor-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60 }),
    ],
  })
)

/**
 * The update handshake.
 *
 * A new worker waits rather than taking over, and takes over only when the
 * page asks it to — because this is a platform where somebody may be
 * halfway through a timed assessment, and swapping the app out from under
 * them is a lost attempt. `usePwaUpdate` shows the prompt and sends this
 * message when the person says yes.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

/**
 * Background Sync: wake the app when the connection is back (12.3).
 *
 * The worker cannot send the queue itself — every endpoint here needs a
 * Bearer token that lives in the page, not in the worker, and keeping a
 * credential somewhere that outlives the session would be a bad trade for
 * telemetry. So this wakes any open client and lets it flush; with no
 * client open the queue goes out the next time the app is opened.
 */
self.addEventListener('sync', (event) => {
  if (event.tag !== 'qollanma-offline-queue') return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' })
    })
  )
})
