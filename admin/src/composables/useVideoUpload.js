import { ref } from 'vue'
import * as tus from 'tus-js-client'
import { useAuthStore } from '@/stores/auth'

const UPLOAD_ENDPOINT = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1'}/videos/upload`

export function useVideoUpload() {
  const auth = useAuthStore()

  const status = ref('idle') // idle | uploading | paused | success | error
  const progress = ref(0)
  const speedBytesPerSecond = ref(0)
  const etaSeconds = ref(0)
  const errorMessage = ref('')
  let currentUpload = null
  let lastSample = null

  function start({ file, topicId, title, description, required, order }) {
    status.value = 'uploading'
    progress.value = 0
    errorMessage.value = ''

    currentUpload = new tus.Upload(file, {
      endpoint: UPLOAD_ENDPOINT,
      chunkSize: 8 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      metadata: {
        topicId,
        title,
        description: description ?? '',
        filename: file.name,
        filetype: file.type,
        required: required ? 'true' : 'false',
        order: String(order ?? 0),
      },
      // Pulled fresh on every request (not just once at construction) so a
      // long upload picks up a token refreshed elsewhere in the app rather
      // than failing once the snapshot token's 15-minute TTL expires.
      onBeforeRequest(req) {
        req.setHeader('Authorization', `Bearer ${auth.accessToken}`)
      },
      onProgress(bytesSent, bytesTotal) {
        progress.value = Math.round((bytesSent / bytesTotal) * 100)
        const now = performance.now()
        if (lastSample) {
          const elapsed = (now - lastSample.time) / 1000
          if (elapsed > 0.3) {
            const rate = (bytesSent - lastSample.bytes) / elapsed
            speedBytesPerSecond.value = rate
            etaSeconds.value = rate > 0 ? Math.round((bytesTotal - bytesSent) / rate) : 0
            lastSample = { time: now, bytes: bytesSent }
          }
        } else {
          lastSample = { time: now, bytes: bytesSent }
        }
      },
      onSuccess() {
        status.value = 'success'
      },
      onError(error) {
        status.value = 'error'
        errorMessage.value = error.message
      },
    })

    currentUpload.start()
  }

  function pause() {
    if (currentUpload && status.value === 'uploading') {
      currentUpload.abort(false)
      status.value = 'paused'
    }
  }

  function resume() {
    if (currentUpload && status.value === 'paused') {
      status.value = 'uploading'
      currentUpload.start()
    }
  }

  function cancel() {
    if (currentUpload) {
      currentUpload.abort(true)
      currentUpload = null
    }
    status.value = 'idle'
    progress.value = 0
    speedBytesPerSecond.value = 0
    etaSeconds.value = 0
    lastSample = null
  }

  return { status, progress, speedBytesPerSecond, etaSeconds, errorMessage, start, pause, resume, cancel }
}
