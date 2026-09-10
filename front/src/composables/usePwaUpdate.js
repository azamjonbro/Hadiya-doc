import { ref } from 'vue'

/**
 * The service-worker update handshake, in the app (12.1).
 *
 * The worker is registered with `registerType: 'prompt'`, so a new version
 * downloads and then **waits**. This is what tells somebody it is there and
 * takes over only when they say so — because this platform runs timed
 * assessments, and reloading the app under a learner halfway through one is
 * a lost attempt.
 *
 * The virtual module is provided by vite-plugin-pwa at build time. In dev
 * there is no worker (`devOptions.enabled: false`), so the import is
 * dynamic and its absence is not an error — that keeps `npm run dev` from
 * needing a build step.
 */
const needsRefresh = ref(false)
const offlineReady = ref(false)
let applyUpdate = async () => {}

export function usePwaUpdate() {
  return { needsRefresh, offlineReady, refresh: () => applyUpdate(true) }
}

export async function registerPwa() {
  // Never in a non-secure context: a service worker is refused outside
  // https (localhost excepted), and the thrown error would surface as a
  // toast on a plain-http deployment for no reason.
  if (!('serviceWorker' in navigator)) return

  try {
    const { registerSW } = await import('virtual:pwa-register')
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        needsRefresh.value = true
      },
      onOfflineReady() {
        // Said once, quietly: the useful moment to learn the app works
        // without a network is before the network is gone.
        offlineReady.value = true
      },
      onRegisterError(error) {
        // Not shown to the person: a worker that failed to register means
        // the app is online-only, which is exactly how it behaved before
        // this feature existed.
        console.warn('[pwa] the service worker did not register', error)
      },
    })
  } catch (error) {
    // The virtual module does not exist in a dev server without the
    // plugin's dev mode. Nothing to do, and nothing worth telling anybody.
    console.debug('[pwa] no service worker in this build', error)
  }
}
