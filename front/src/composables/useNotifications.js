import { onBeforeUnmount, onMounted, ref } from 'vue'
import { notificationsApi } from '@/services/notifications'

const POLL_INTERVAL_MS = 45_000

export function useNotifications() {
  const items = ref([])
  const unreadCount = ref(0)
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const result = await notificationsApi.list({ limit: 10 })
      items.value = result.items
      unreadCount.value = result.unreadCount
    } finally {
      loading.value = false
    }
  }

  async function markRead(notification) {
    if (notification.read) return
    await notificationsApi.markRead(notification.id)
    notification.read = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }

  async function markAllRead() {
    await notificationsApi.markAllRead()
    items.value = items.value.map((n) => ({ ...n, read: true }))
    unreadCount.value = 0
  }

  let pollTimer = null
  onMounted(() => {
    load()
    pollTimer = setInterval(load, POLL_INTERVAL_MS)
  })
  onBeforeUnmount(() => clearInterval(pollTimer))

  return { items, unreadCount, loading, load, markRead, markAllRead }
}
