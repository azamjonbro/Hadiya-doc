import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { bindAuthStore } from './services/http'
import { useAuthStore } from './stores/auth'
import './assets/main.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  const authStore = useAuthStore()
  bindAuthStore(authStore)
  await authStore.restoreSession()

  app.use(router)
  app.use(i18n)
  app.mount('#app')
}

bootstrap()
