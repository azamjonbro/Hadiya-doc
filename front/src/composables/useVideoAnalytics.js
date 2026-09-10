import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL } from '@/services/apiBase'
import { enqueue, isRetryable } from '@/offline/queue'

const FLUSH_INTERVAL_MS = 10_000

function apiBase() {
  return API_BASE_URL
}

export function useVideoAnalytics(videoId) {
  const auth = useAuthStore()
  const sessionId = crypto.randomUUID()

  let buffer = []
  let videoEl = null
  let isPlaying = false
  let lastTimeupdateAt = null
  let lastPosition = null
  let bufferingStartedAt = null
  let tabHiddenAt = null
  let flushTimer = null

  function pushEvent(eventType, extra = {}) {
    /**
     * Every event carries the id it was created with (12.3).
     *
     * Generated here, where the event happens — possibly offline, possibly
     * hours before it is sent. It is what makes a replayed queue safe: the
     * server's unique index on `(userId, clientEventId)` rejects the
     * repeats, so five minutes watched adds 300 seconds however many times
     * the queue is flushed (AT-35).
     */
    buffer.push({
      eventType,
      timestamp: new Date().toISOString(),
      clientEventId: crypto.randomUUID(),
      ...extra,
    })
  }

  // Lets the attention monitor put its own events on the same buffer, so they
  // are batched, ordered and flushed with the playback events they have to be
  // correlated against server-side rather than racing them on a second
  // channel.
  function track(eventType, extra = {}) {
    pushEvent(eventType, extra)
  }

  // fetch+keepalive (not navigator.sendBeacon) because the endpoint is
  // Bearer-token authenticated and sendBeacon can't carry custom headers —
  // keepalive is the modern equivalent that survives page/tab teardown.
  function flush(isFinal = false) {
    if (buffer.length === 0) return
    const events = buffer
    buffer = []
    const body = { sessionId, videoId, events }
    fetch(`${apiBase()}/analytics/video/events`, {
      method: 'POST',
      keepalive: isFinal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify(body),
    })
      .then((response) => {
        // A 5xx or a refused request is not "sent": queue it and let the
        // queue's own retry deal with it.
        if (!response.ok && isRetryable(response.status)) queueBatch(body)
      })
      .catch(() => {
        /**
         * This is what used to lose five minutes of watched video (12.3).
         *
         * A lift, a basement, a dropped Wi-Fi — the request fails, and
         * before this the `.catch(() => {})` threw the events away
         * silently. Now they wait in IndexedDB and go out when the
         * connection is back; the ids on them make that safe.
         */
        queueBatch(body)
      })
  }

  /** One queue entry per batch, keyed by the batch's own event ids. */
  function queueBatch(body) {
    enqueue({
      // Derived from the batch rather than random, so re-queueing the same
      // batch (a retry that also failed) replaces its entry instead of
      // adding a second copy of the same work.
      id: `video:${sessionId}:${body.events[0]?.clientEventId ?? crypto.randomUUID()}`,
      url: '/analytics/video/events',
      body,
      kind: 'VIDEO_EVENTS',
    }).catch(() => {})
  }

  function onPlay() {
    isPlaying = true
    pushEvent('play')
    lastTimeupdateAt = performance.now()
    lastPosition = videoEl.currentTime
  }

  function onPause() {
    isPlaying = false
    pushEvent('pause')
  }

  function onSeeking() {
    pushEvent('seeking')
  }

  function onSeeked() {
    const from = lastPosition ?? videoEl.currentTime
    const to = videoEl.currentTime
    pushEvent('seeked', { metadata: { from, to } })
    lastPosition = to
    lastTimeupdateAt = performance.now()
  }

  function onWaiting() {
    bufferingStartedAt = performance.now()
    pushEvent('buffering')
  }

  function onPlaying() {
    if (bufferingStartedAt) {
      pushEvent('waiting', { duration: (performance.now() - bufferingStartedAt) / 1000 })
      bufferingStartedAt = null
    }
  }

  function onTimeupdate() {
    if (!isPlaying || !videoEl) return
    const now = performance.now()
    if (lastTimeupdateAt !== null && lastPosition !== null) {
      const elapsedSeconds = (now - lastTimeupdateAt) / 1000
      const positionDelta = videoEl.currentTime - lastPosition
      // Only counts as genuine playback progress when wall-clock elapsed
      // time and position both moved forward together and roughly match —
      // a seek jump changes position without matching elapsed time.
      if (elapsedSeconds > 0 && elapsedSeconds < 2 && positionDelta > 0 && positionDelta < 2) {
        pushEvent('progress', { position: lastPosition, duration: positionDelta })
      }
    }
    lastTimeupdateAt = now
    lastPosition = videoEl.currentTime
  }

  function onEnded() {
    pushEvent('ended')
    flush(true)
  }

  function onVisibilityChange() {
    if (document.hidden) {
      tabHiddenAt = performance.now()
      pushEvent('tabHidden')
    } else if (tabHiddenAt !== null) {
      pushEvent('tabVisible', { duration: (performance.now() - tabHiddenAt) / 1000 })
      tabHiddenAt = null
    }
  }

  function onPageHide() {
    flush(true)
  }

  function attach(el) {
    videoEl = el
    videoEl.addEventListener('play', onPlay)
    videoEl.addEventListener('pause', onPause)
    videoEl.addEventListener('seeking', onSeeking)
    videoEl.addEventListener('seeked', onSeeked)
    videoEl.addEventListener('waiting', onWaiting)
    videoEl.addEventListener('playing', onPlaying)
    videoEl.addEventListener('timeupdate', onTimeupdate)
    videoEl.addEventListener('ended', onEnded)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    flushTimer = setInterval(() => flush(false), FLUSH_INTERVAL_MS)
  }

  function detach() {
    if (!videoEl) return
    videoEl.removeEventListener('play', onPlay)
    videoEl.removeEventListener('pause', onPause)
    videoEl.removeEventListener('seeking', onSeeking)
    videoEl.removeEventListener('seeked', onSeeked)
    videoEl.removeEventListener('waiting', onWaiting)
    videoEl.removeEventListener('playing', onPlaying)
    videoEl.removeEventListener('timeupdate', onTimeupdate)
    videoEl.removeEventListener('ended', onEnded)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
    clearInterval(flushTimer)
    flush(true)
    videoEl = null
  }

  return { attach, detach, track, sessionId }
}
