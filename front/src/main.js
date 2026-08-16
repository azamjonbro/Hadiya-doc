import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { bindAuthStore, bindRouter } from './services/http'
import { useAuthStore } from './stores/auth'
import './assets/main.css'

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

  app.use(router)
  app.use(i18n)
  app.mount('#app')
}

bootstrap()
