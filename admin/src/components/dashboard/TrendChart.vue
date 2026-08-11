<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  points: { type: Array, default: () => [] }, // [{ date, totalSeconds }]
})

const W = 300
const H = 100

const containerRef = ref(null)
const hoverIndex = ref(null)

const maxValue = computed(() => Math.max(1, ...props.points.map((p) => p.totalSeconds)))

const coords = computed(() => {
  const n = props.points.length
  if (n === 0) return []
  const step = n > 1 ? W / (n - 1) : 0
  return props.points.map((p, i) => ({
    x: i * step,
    y: H - (p.totalSeconds / maxValue.value) * (H - 12),
    ...p,
  }))
})

const linePath = computed(() =>
  coords.value.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' '),
)

const areaPath = computed(() => {
  if (coords.value.length === 0) return ''
  const last = coords.value[coords.value.length - 1]
  return `${linePath.value} L ${last.x.toFixed(2)} ${H} L 0 ${H} Z`
})

const gridYs = [H * 0.25, H * 0.5, H * 0.75]

function formatDay(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

function formatMinutes(seconds) {
  return Math.round(seconds / 60)
}

function onMove(event) {
  if (!containerRef.value || coords.value.length === 0) return
  const rect = containerRef.value.getBoundingClientRect()
  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  hoverIndex.value = Math.round(fraction * (coords.value.length - 1))
}

const hovered = computed(() => (hoverIndex.value !== null ? coords.value[hoverIndex.value] : null))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="flex items-center justify-between">
      <h3 class="text-small font-semibold text-ink">{{ title }}</h3>
      <span v-if="hovered" class="text-caption text-ink-muted">
        {{ formatDay(hovered.date) }} · <strong class="font-semibold text-ink">{{ formatMinutes(hovered.totalSeconds) }} min</strong>
      </span>
    </div>

    <div v-if="points.length === 0" class="mt-6 text-small text-ink-faint">—</div>

    <div v-else ref="containerRef" class="relative mt-4 h-32" @mousemove="onMove" @mouseleave="hoverIndex = null">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="h-full w-full overflow-visible">
        <line v-for="gy in gridYs" :key="gy" x1="0" :x2="W" :y1="gy" :y2="gy" class="stroke-border" stroke-width="1" />
        <path :d="areaPath" fill="rgb(var(--color-primary) / 0.10)" stroke="none" />
        <path :d="linePath" fill="none" class="stroke-primary" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <template v-if="hovered">
          <line :x1="hovered.x" :x2="hovered.x" y1="0" :y2="H" class="stroke-border-strong" stroke-width="1" stroke-dasharray="3,3" vector-effect="non-scaling-stroke" />
          <circle :cx="hovered.x" :cy="hovered.y" r="3.5" class="fill-primary stroke-surface" stroke-width="2" vector-effect="non-scaling-stroke" />
        </template>
      </svg>
    </div>
    <div v-if="points.length" class="mt-1.5 flex justify-between text-caption text-ink-faint">
      <span>{{ formatDay(points[0].date) }}</span>
      <span>{{ formatDay(points[points.length - 1].date) }}</span>
    </div>
  </div>
</template>
