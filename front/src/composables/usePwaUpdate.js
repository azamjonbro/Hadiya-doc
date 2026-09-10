import { ref } from 'vue'

/**
 * Registering the service worker, and the update handshake (12.1).
 *
 * Written against the browser's own API rather than `workbox-window`, and
 * that was not the first attempt: workbox's `messageSkipWaiting()`
 * silently did nothing when the update had been found by the browser
 * rather than by workbox itself — the prompt appeared, the button did
 * nothing, and no error was raised anywhere. Posting the message to the
 * waiting worker directly is four lines, works however the update was
 * found, and is the version a browser probe can actually prove.
 *
 * The URL is the bare `/sw.js`, deliberately — an earlier version stamped
 * it (`/sw.js?v=<build>`) to dodge Cloudflare's four-hour edge cache on
 * `.js`, and a browser probe caught what that costs: after taking an
 * update the page reloads into the new build, which registers a
 * *differently stamped* URL, the browser counts a changed script URL as a
 * new version, and the prompt comes straight back — an endless "new
 * version available" loop after every deploy. A stable URL cannot do that.
 * The edge delay is real and its fix belongs in nginx
 * (`location = /sw.js` → `Cache-Control: no-cache`); until then a deploy
 * reaches an open tab within the edge TTL, which is a wait rather than a
 * defect.
 *
 * The new worker **waits** rather than taking over: this platform runs
 * timed assessments, and reloading the app under a learner halfway through
 * one is a lost attempt.
 */
const needsRefresh = ref(false)
const offlineReady = ref(false)

// How often to ask whether a new version exists. The browser checks on
// navigation anyway; this covers the person who leaves the app open all
// day, which in an LMS is most of them.
const UPDATE_INTERVAL_MS = 60 * 60 * 1000

async function activate() {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.waiting) {
    // Nothing waiting any more (another tab took the update). A reload is
    // still the right answer to "give me the new version".
    window.location.reload()
    return
  }
  // Reload only once the new worker is in control, or the page comes back
  // on the old one and the prompt returns immediately.
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  registration.waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function usePwaUpdate() {
  return { needsRefresh, offlineReady, refresh: activate }
}

export async function registerPwa() {
  // A worker is refused outside a secure context (https, or localhost), so
  // on a plain-http deployment there is nothing to do — and nothing worth
  // telling anybody.
  if (!('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    // A version that was already waiting when this page opened — the
    // person closed the tab last time without taking it.
    if (registration.waiting && navigator.serviceWorker.controller) needsRefresh.value = true

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        if (installing.state !== 'installed') return
        if (navigator.serviceWorker.controller) {
          // There is an old worker in control, so this one is waiting: ask.
          needsRefresh.value = true
        } else {
          // First install: nothing to interrupt, and worth saying once —
          // the useful moment to learn the app works without a network is
          // before the network is gone.
          offlineReady.value = true
        }
      })
    })

    // `update()` is a no-op when nothing changed, so an hourly check costs
    // one conditional request.
    setInterval(() => registration.update().catch(() => {}), UPDATE_INTERVAL_MS)
  } catch (error) {
    // A registration that fails leaves the app exactly as it behaved
    // before this feature existed: online-only.
    console.warn('[pwa] the service worker did not register', error)
  }
}
