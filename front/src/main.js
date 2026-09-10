import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { bindAuthStore, bindRouter } from './services/http'
import { useAuthStore } from './stores/auth'
import { useToast } from './composables/useToast'
import { apiErrorText } from './utils/apiError'
import { registerPwa } from './composables/usePwaUpdate'
import './assets/main.css'

/**
 * The last line of defence for a request nobody caught.
 *
 * A click handler that awaits an API call and forgets to handle a rejection
 * fails completely silently: the promise rejects, the console logs it, and
 * from the outside the button simply does nothing — no spinner, no message,
 * no change. Several delete and edit buttons behaved exactly that way, and
 * the only reason anybody found out was a person saying "some of the buttons
 * don't work".
 *
 * Every one of those has been given a proper error path. This exists so the
 * next one that slips through is visible on the first click instead of the
 * hundredth, and it deliberately shows the same message a handled error
 * would: a person reading it should not have to know which kind it was.
 *
 * Vue's own errorHandler covers render and lifecycle errors; this covers the
 * async ones, which are the ones that hide.
 */
function reportUnhandled(app) {
  const toast = useToast()

  /**
   * A failed request gets its real reason; anything else gets a generic
   * line.
   *
   * apiErrorText answers "no response" with "network error", which is right
   * for a request and wrong for a TypeError in a render function — telling
   * somebody their connection dropped when the truth is a bug in this code
   * sends them to restart their router.
   */
  const describe = (reason) => {
    const isRequestFailure =
      Boolean(reason?.response) || ['ECONNABORTED', 'ERR_NETWORK'].includes(reason?.code)
    return isRequestFailure ? apiErrorText(reason) : i18n.global.t('errors.unknown')
  }

  app.config.errorHandler = (error, instance, info) => {
    console.error('[vue]', info, error)
    toast.error(describe(error))
  }

  window.addEventListener('unhandledrejection', (event) => {
    // A cancelled request is a typeahead being retyped, not a failure.
    if (event.reason?.code === 'ERR_CANCELED' || event.reason?.name === 'CanceledError') return
    /**
     * Offline, a failed request is the expected outcome (12.2), not news.
     * The banner already says there is no connection, and a toast reading
     * "network error" on top of a page that is deliberately being read
     * from storage tells somebody their saved course is broken when it is
     * not. Still logged, because a *request* nobody handled is still a
     * gap worth finding.
     */
    const isNetworkFailure = !event.reason?.response && ['ERR_NETWORK', 'ECONNABORTED'].includes(event.reason?.code)
    // `navigator.onLine` is a hint the browser sometimes gets wrong, so the
    // app's own read-only offline session counts as well: in that mode the
    // page is *known* to be rendering from storage.
    const knownOffline = navigator.onLine === false || useAuthStore().offlineOnly
    if (isNetworkFailure && knownOffline) {
      console.warn('[offline] a request failed while offline', event.reason?.config?.url ?? '')
      return
    }
    console.error('[unhandled]', event.reason)
    toast.error(describe(event.reason))
  })
}

function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  const authStore = useAuthStore()
  bindAuthStore(authStore)
  bindRouter(router)

  // Deliberately NOT awaited. Blocking the mount on a round trip to the API
  // left the page blank until it came back — and, worse, serialised the
  // route's own chunk behind it, since the router could not resolve the first
  // route until the session was known. The guard awaits the same promise, so
  // nothing is decided before the answer arrives; the shell just gets to paint
  // and the chunk gets to download while it is in flight.
  authStore.ensureSession()
  // 12.2 — leave the read-only offline session as soon as the connection
  // is back, rather than on the next reload.
  authStore.watchNetwork()

  app.use(router)
  app.use(i18n)
  // After i18n, because the fallback message is translated.
  reportUnhandled(app)
  app.mount('#app')

  // 12.1 — after the mount, deliberately: registering the worker is not
  // on the path to the first paint, and a browser that refuses it
  // (private mode, plain http) must not keep the app from starting.
  registerPwa()
}

bootstrap()
