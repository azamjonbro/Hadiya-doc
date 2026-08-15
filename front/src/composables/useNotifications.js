import { onBeforeUnmount, onMounted, ref } from 'vue'
import { notificationsApi } from '@/services/notifications'
import { onSocket } from '@/services/socket'
import { useToast } from '@/composables/useToast'

// The socket is the primary delivery path now (the server pushes on every
// notificationService.notify — task assigned, task completed, course
// assigned, deadline reminders, ...). The poll stays as a much slower
// safety net for a dropped connection rather than as the way notifications
// normally arrive.
const POLL_INTERVAL_MS = 120_000

// Module-level so every mounted consumer (the topbar bell and the
// notifications page at the same time) shares one list and one badge
// count, instead of each keeping a copy that drifts.
const items = ref([])
const unreadCount = ref(0)
const loading = ref(false)
let socketBound = false

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

function bindSocket(toast) {
  if (socketBound) return
  socketBound = true

  onSocket('notification:new', (notification) => {
    if (items.value.some((n) => n.id === notification.id)) return
    items.value = [notification, ...items.value].slice(0, 20)
    unreadCount.value += 1

    const variant = { CRITICAL: 'error', WARNING: 'warning' }[notification.severity] ?? 'info'
    toast[variant](notification.title)
  })
}

export function useNotifications() {
  const toast = useToast()
  bindSocket(toast)

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
