<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import { formatDuration } from '@/utils/chatFormat'

const emit = defineEmits(['recorded', 'error'])

const { t } = useI18n()

const MAX_SECONDS = 300

const recording = ref(false)
const seconds = ref(0)
// Live input level (0–1), sampled from an AnalyserNode so the user can see
// that the mic is actually picking them up before they send anything.
const level = ref(0)

let mediaRecorder = null
let stream = null
let chunks = []
let timer = null
let audioContext = null
let analyser = null
let rafId = null
let cancelled = false

const label = computed(() => formatDuration(seconds.value))

// Browsers disagree on what MediaRecorder can produce: Chrome/Firefox do
// Opus-in-WebM, Safari does AAC-in-MP4. Picking the first supported type
// keeps the recorder working everywhere, and the backend's magic-byte
// allowlist accepts either container.
function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ?? ''
}

function meter() {
  if (!analyser) return
  const buffer = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteTimeDomainData(buffer)
  let peak = 0
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample - 128) / 128)
  level.value = peak
  rafId = requestAnimationFrame(meter)
}

function teardown() {
  clearInterval(timer)
  cancelAnimationFrame(rafId)
  stream?.getTracks().forEach((track) => track.stop())
  audioContext?.close()
  stream = null
  audioContext = null
  analyser = null
  mediaRecorder = null
  level.value = 0
}

async function start() {
  if (recording.value) return
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    emit('error', t('chat.voice.unsupported'))
    return
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    // Almost always a denied permission prompt; either way the user needs
    // to be told rather than left with a button that silently does nothing.
    emit('error', t('chat.voice.permissionDenied'))
    return
  }

  cancelled = false
  chunks = []
  seconds.value = 0

  const mimeType = pickMimeType()
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data)
  })
  mediaRecorder.addEventListener('stop', () => {
    const recordedSeconds = seconds.value
    const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || mimeType || 'audio/webm' })
    teardown()
    recording.value = false
    if (!cancelled && blob.size) emit('recorded', { blob, durationSec: recordedSeconds })
  })

  mediaRecorder.start()
  recording.value = true

  audioContext = new (window.AudioContext ?? window.webkitAudioContext)()
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 512
  audioContext.createMediaStreamSource(stream).connect(analyser)
  meter()

  timer = setInterval(() => {
    seconds.value += 1
    // Hard stop rather than an error: a note this long is almost always an
    // accident, and stopping keeps whatever was said.
    if (seconds.value >= MAX_SECONDS) stop()
  }, 1000)
}

function stop() {
  if (!recording.value) return
  mediaRecorder?.stop()
}

function cancel() {
  if (!recording.value) return
  cancelled = true
  mediaRecorder?.stop()
}

onBeforeUnmount(() => {
  cancelled = true
  mediaRecorder?.stop()
  teardown()
})

defineExpose({ start, stop, cancel, recording })
</script>

<template>
  <div v-if="recording" class="flex flex-1 items-center gap-3 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2">
    <span class="relative flex h-2.5 w-2.5 shrink-0">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-70" />
      <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
    </span>

    <span class="shrink-0 text-small font-semibold tabular-nums text-danger">{{ label }}</span>

    <div class="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
      <span
        v-for="i in 40"
        :key="i"
        class="w-[3px] shrink-0 rounded-full bg-danger/70 transition-[height] duration-75"
        :style="{ height: `${12 + Math.abs(Math.sin(i * 0.9)) * level * 88}%` }"
      />
    </div>

    <button
      type="button"
      class="shrink-0 rounded-md px-2 py-1 text-caption font-medium text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
      @click="cancel"
    >
      {{ t('common.cancel') }}
    </button>
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-default hover:opacity-90"
      :aria-label="t('chat.voice.send')"
      @click="stop"
    >
      <Icon name="send" size="15" />
    </button>
  </div>
</template>
