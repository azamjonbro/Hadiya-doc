<script setup>
import { computed, ref } from 'vue'

/**
 * A small chart: a line for something over time, bars for comparing named
 * values.
 *
 * Hand-rolled SVG rather than a charting library, deliberately. The dashboard
 * needs sparkline-sized pictures of one series at a time — no zoom, no
 * legend, no second axis — and the smallest of the usual libraries is around
 * 60 kB gzipped, which is more than this whole admin bundle spends on
 * anything else. The one already written here (the watch-time trend) proved
 * the shape; this is that, generalised so the next chart is a prop and not
 * another eighty lines of path arithmetic.
 *
 * The series is `{ label, value }` — the caller formats the label and the
 * value, since only it knows whether a number is seconds, a percentage or a
 * headcount.
 */
const props = defineProps({
  type: { type: String, default: 'line' }, // 'line' | 'bar'
  // [{ label, value }]
  series: { type: Array, default: () => [] },
  title: { type: String, default: '' },
  emptyText: { type: String, default: '—' },
  // Turns a raw value into what the tooltip shows.
  format: { type: Function, default: (value) => value },
  height: { type: String, default: 'h-32' },
})

const W = 300
const H = 100
const TOP_PAD = 12

const containerRef = ref(null)
const hoverIndex = ref(null)

// Never zero: every value would otherwise divide by it and the whole series
// would draw along the top edge.
const maxValue = computed(() => Math.max(1, ...props.series.map((point) => Number(point.value) || 0)))

const points = computed(() => {
  const n = props.series.length
  if (n === 0) return []
  const step = n > 1 ? W / (n - 1) : 0
  return props.series.map((point, i) => ({
    ...point,
    index: i,
    x: i * step,
    y: H - ((Number(point.value) || 0) / maxValue.value) * (H - TOP_PAD),
  }))
})

const bars = computed(() => {
  const n = props.series.length
  if (n === 0) return []
  const slot = W / n
  const width = Math.max(2, slot * 0.6)
  return props.series.map((point, i) => {
    const barHeight = ((Number(point.value) || 0) / maxValue.value) * (H - TOP_PAD)
    return {
      ...point,
      index: i,
      x: i * slot + (slot - width) / 2,
      width,
      y: H - barHeight,
      height: Math.max(barHeight, 0),
    }
  })
})

const linePath = computed(() =>
  points.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
)

const areaPath = computed(() => {
  if (points.value.length === 0) return ''
  const last = points.value[points.value.length - 1]
  return `${linePath.value} L ${last.x.toFixed(2)} ${H} L 0 ${H} Z`
})

const gridYs = [H * 0.25, H * 0.5, H * 0.75]

const hovered = computed(() => {
  if (hoverIndex.value === null) return null
  return props.type === 'bar' ? bars.value[hoverIndex.value] : points.value[hoverIndex.value]
})

// Nearest point to the cursor rather than a hit area per mark: a fourteen-day
// line is 21px between points, which is too small a target to ask anyone to
// hit exactly.
function onMove(event) {
  const count = props.series.length
  if (!containerRef.value || count === 0) return
  const rect = containerRef.value.getBoundingClientRect()
  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  hoverIndex.value =
    props.type === 'bar'
      ? Math.min(count - 1, Math.floor(fraction * count))
      : Math.round(fraction * (count - 1))
}
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="flex items-center justify-between gap-2">
      <h3 v-if="title" class="text-small font-semibold text-ink">{{ title }}</h3>
      <span v-if="hovered" class="truncate text-caption text-ink-muted">
        {{ hovered.label }} · <strong class="font-semibold text-ink">{{ format(hovered.value) }}</strong>
      </span>
    </div>

    <p v-if="series.length === 0" class="mt-6 text-small text-ink-faint">{{ emptyText }}</p>

    <div
      v-else
      ref="containerRef"
      class="relative mt-4"
      :class="height"
      @mousemove="onMove"
      @mouseleave="hoverIndex = null"
    >
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="h-full w-full overflow-visible">
        <line v-for="gy in gridYs" :key="gy" x1="0" :x2="W" :y1="gy" :y2="gy" class="stroke-border" stroke-width="1" />

        <template v-if="type === 'bar'">
          <rect
            v-for="bar in bars"
            :key="bar.index"
            :x="bar.x"
            :y="bar.y"
            :width="bar.width"
            :height="bar.height"
            rx="1"
            class="fill-primary transition-default"
            :class="hoverIndex !== null && hoverIndex !== bar.index ? 'opacity-40' : ''"
          />
        </template>

        <template v-else>
          <path :d="areaPath" fill="rgb(var(--color-primary) / 0.10)" stroke="none" />
          <path
            :d="linePath"
            fill="none"
            class="stroke-primary"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
          <template v-if="hovered">
            <line
              :x1="hovered.x"
              :x2="hovered.x"
              y1="0"
              :y2="H"
              class="stroke-border-strong"
              stroke-width="1"
              stroke-dasharray="3,3"
              vector-effect="non-scaling-stroke"
            />
            <circle
              :cx="hovered.x"
              :cy="hovered.y"
              r="3.5"
              class="fill-primary stroke-surface"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </template>
      </svg>
    </div>

    <div v-if="series.length > 1" class="mt-1.5 flex justify-between text-caption text-ink-faint">
      <span>{{ series[0].label }}</span>
      <span>{{ series[series.length - 1].label }}</span>
    </div>
  </div>
</template>
