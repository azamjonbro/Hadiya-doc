import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL } from '@/services/apiBase'

const FLUSH_INTERVAL_MS = 10_000
const MIN_DEPTH_DELTA = 4

function apiBase() {
  return API_BASE_URL
}

export function useScrollAnalytics(newsId) {
  const auth = useAuthStore()

  let buffer = []
  let activeSecondsSinceFlush = 0
  let lastDepthSent = 0
  let tickTimer = null
  let flushTimer = null

  function pushEvent(eventType, extra = {}) {
    buffer.push({ eventType, timestamp: new Date().toISOString(), ...extra })
  }

  function flush(isFinal = false) {
    if (activeSecondsSinceFlush > 0) {
      pushEvent('timeSpent', { duration: activeSecondsSinceFlush })
      activeSecondsSinceFlush = 0
    }
    if (buffer.length === 0) return
    const events = buffer
    buffer = []
    fetch(`${apiBase()}/news-analytics/${newsId}/events`, {
      method: 'POST',
      keepalive: isFinal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ events }),
    }).catch(() => {})
  }

  function onScroll() {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
    const depth = scrollableHeight > 0 ? Math.round((window.scrollY / scrollableHeight) * 100) : 100
    if (depth > lastDepthSent + MIN_DEPTH_DELTA) {
      lastDepthSent = depth
      pushEvent('scroll', { depth })
    }
  }

  function onTick() {
    if (!document.hidden) activeSecondsSinceFlush += 1
  }

  function onPageHide() {
    flush(true)
  }

  function start() {
    pushEvent('opened')
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', onPageHide)
    tickTimer = setInterval(onTick, 1000)
    flushTimer = setInterval(() => flush(false), FLUSH_INTERVAL_MS)
  }

  function stop() {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pagehide', onPageHide)
    clearInterval(tickTimer)
    clearInterval(flushTimer)
    flush(true)
  }

  return { start, stop }
}
