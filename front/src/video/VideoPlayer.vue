<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Hls from 'hls.js'
import { useAuthStore } from '@/stores/auth'
import { videoAccessApi } from '@/services/videoAccess'

const props = defineProps({ videoId: { type: String, required: true } })

const auth = useAuthStore()
const videoEl = ref(null)
const errorMessage = ref('')
const now = ref(new Date())

// Deterrent only, never a security boundary (spec §2) — the real
// authorization is the per-segment token re-validated on every request by
// the backend. Repositioning periodically makes cropping the watermark out
// of a leaked recording harder.
const WATERMARK_POSITIONS = ['bottom-2 right-2', 'top-2 left-2', 'bottom-2 left-2', 'top-2 right-2']
const positionIndex = ref(0)

let hls = null
let currentToken = null
let tokenRefreshTimer = null
let clockTimer = null
let positionTimer = null

function apiBase() {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1'
}

function manifestUrl(token) {
  return `${apiBase()}/video-stream/${props.videoId}/master.m3u8?token=${token}`
}

async function fetchToken() {
  const { token } = await videoAccessApi.issueToken(props.videoId)
  currentToken = token
  return token
}

async function setup() {
  try {
    const token = await fetchToken()

    if (Hls.isSupported()) {
      hls = new Hls({
        // The manifest is fetched once (VOD), so segment URLs carry the
        // token from that fetch — this swaps in whatever token is current
        // at request time so playback survives past the original token's
        // TTL on longer videos.
        xhrSetup: (xhr, url) => {
          const rewritten = new URL(url)
          if (rewritten.searchParams.has('token') && currentToken) {
            rewritten.searchParams.set('token', currentToken)
          }
          xhr.open('GET', rewritten.toString(), true)
        },
      })
      hls.loadSource(manifestUrl(token))
      hls.attachMedia(videoEl.value)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) errorMessage.value = data.details ?? 'Playback error'
      })
    } else if (videoEl.value.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.value.src = manifestUrl(token)
    } else {
      errorMessage.value = 'HLS playback is not supported in this browser'
    }

    tokenRefreshTimer = setInterval(() => {
      fetchToken().catch(() => {})
    }, 120_000)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

onMounted(() => {
  setup()
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  positionTimer = setInterval(() => {
    positionIndex.value = (positionIndex.value + 1) % WATERMARK_POSITIONS.length
  }, 8000)
})

onBeforeUnmount(() => {
  hls?.destroy()
  clearInterval(tokenRefreshTimer)
  clearInterval(clockTimer)
  clearInterval(positionTimer)
})
</script>

<template>
  <div class="relative overflow-hidden rounded-lg bg-black">
    <video ref="videoEl" controls class="aspect-video w-full" />
    <div
      class="pointer-events-none absolute select-none rounded bg-black/40 px-2 py-1 font-mono text-[10px] leading-tight text-white/70"
      :class="WATERMARK_POSITIONS[positionIndex]"
    >
      {{ auth.user?.fullName }} · {{ auth.user?.id?.slice(-6) }} · Corporate LMS · {{ now.toLocaleString() }}
    </div>
    <p v-if="errorMessage" class="p-2 text-sm text-red-400">{{ errorMessage }}</p>
  </div>
</template>
