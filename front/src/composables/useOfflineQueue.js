import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL } from '@/services/apiBase'
import { flushQueue, onQueueChange, queueSize, registerBackgroundSync } from '@/offline/queue'

/**
 * Draining the offline queue, and showing how much is in it (12.3).
 *
 * Flushed on three occasions, because each one covers a case the others
 * miss: when the app opens (the queue may be from a previous session),
 * when the browser reports the connection back, and when the service
 * worker's Background Sync wakes us (which fires even when the page was
 * loaded before the connection returned and no `online` event ever came).
 */
const pending = ref(0)
let started = false

async function flush() {
  const auth = useAuthStore()
  // No token means no session — including the read-only offline one (12.2),
  // where a flush would fail on every item and burn their attempt budget.
  if (!auth.accessToken) return
  await flushQueue({ authToken: auth.accessToken, apiBase: API_BASE_URL })
}

export function useOfflineQueue() {
  const stop = ref(null)

  onMounted(async () => {
    pending.value = await queueSize()
    stop.value = onQueueChange((size) => {
      pending.value = size
    })

    if (started) return
    started = true

    /**
     * Flushed when a token appears, not only when the browser says the
     * connection is back (12.3).
     *
     * Both listeners fire on the same `online` event, and the session is
     * restored asynchronously — so a flush triggered by `online` ran while
     * the app was still in the read-only offline session with no token,
     * found nothing it could send, and left the queue sitting there until
     * the next reload. Watching the token covers the order the events
     * actually arrive in.
     */
    watch(
      () => useAuthStore().accessToken,
      (token) => {
        if (token) flush()
      }
    )

    window.addEventListener('online', flush)
    navigator.serviceWorker?.addEventListener?.('message', (event) => {
      if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') flush()
    })
    await registerBackgroundSync()
    // On open: anything left from a previous session goes now, before the
    // person adds more to it.
    await flush()
  })

  onUnmounted(() => stop.value?.())

  return { pending, flush }
}
