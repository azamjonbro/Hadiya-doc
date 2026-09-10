<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import { formatDuration } from '@/utils/chatFormat'

const { t } = useI18n()

const props = defineProps({
  src: { type: String, required: true },
  // Recorded client-side and sent with the message, so the bar has a
  // length before the audio metadata has loaded.
  durationSec: { type: Number, default: 0 },
  tone: { type: String, default: 'neutral' }, // neutral | onPrimary
})

const audio = ref(null)
const playing = ref(false)
const currentTime = ref(0)
const loadedDuration = ref(0)

const duration = computed(() => loadedDuration.value || props.durationSec || 0)
const progress = computed(() => (duration.value ? Math.min(100, (currentTime.value / duration.value) * 100) : 0))
const remaining = computed(() => formatDuration(playing.value ? currentTime.value : duration.value))

// A fixed pseudo-waveform: the real amplitude envelope would need the
// whole file decoded before the bubble could render, which is far too much
// work for a decoration. The bar heights are derived from the duration so
// two different notes still look different.
const bars = computed(() => {
  const count = 34
  const seed = Math.max(1, Math.round(duration.value * 7)) || 13
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index + seed) * 1.7) * Math.cos((index + seed) * 0.6)
    return 28 + Math.abs(wave) * 72
  })
})

function ensureAudio() {
  if (audio.value) return audio.value
  const element = new Audio(props.src)
  element.preload = 'metadata'
  element.addEventListener('timeupdate', () => {
    currentTime.value = element.currentTime
  })
  element.addEventListener('loadedmetadata', () => {
    // Chrome reports Infinity for MediaRecorder WebM until it is seeked;
    // falling back to the recorded duration keeps the bar sane.
    if (Number.isFinite(element.duration)) loadedDuration.value = element.duration
  })
  element.addEventListener('ended', () => {
    playing.value = false
    currentTime.value = 0
  })
  audio.value = element
  return element
}

function toggle() {
  const element = ensureAudio()
  if (playing.value) {
    element.pause()
    playing.value = false
    return
  }
  element.play()
  playing.value = true
}

function seek(event) {
  const element = ensureAudio()
  if (!duration.value) return
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  element.currentTime = ratio * duration.value
  currentTime.value = element.currentTime
}

// A signed attachment URL is refreshed whenever the message is re-fetched;
// swapping the source has to reset playback rather than keep a stale one.
watch(
  () => props.src,
  () => {
    audio.value?.pause()
    audio.value = null
    playing.value = false
    currentTime.value = 0
  }
)

onBeforeUnmount(() => {
  audio.value?.pause()
  audio.value = null
})
</script>

<template>
  <div class="flex min-w-[13rem] max-w-[17rem] items-center gap-2.5">
    <button
      type="button"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-default"
      :class="
        tone === 'onPrimary'
          ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
          : 'bg-primary text-primary-foreground hover:opacity-90'
      "
      :aria-label="playing ? t('common.pause') : t('common.play')"
      @click="toggle"
    >
      <Icon :name="playing ? 'pause' : 'play'" size="16" />
    </button>

    <div class="min-w-0 flex-1">
      <div class="flex h-7 cursor-pointer items-center gap-[2px]" @click="seek">
        <span
          v-for="(height, index) in bars"
          :key="index"
          class="w-[3px] shrink-0 rounded-full transition-[opacity] duration-150"
          :style="{ height: `${height}%` }"
          :class="[
            tone === 'onPrimary' ? 'bg-primary-foreground' : 'bg-primary',
            (index / bars.length) * 100 <= progress ? 'opacity-100' : 'opacity-30',
          ]"
        />
      </div>
      <p
        class="mt-0.5 text-caption tabular-nums"
        :class="tone === 'onPrimary' ? 'text-primary-foreground/75' : 'text-ink-faint'"
      >
        {{ remaining }}
      </p>
    </div>
  </div>
</template>
