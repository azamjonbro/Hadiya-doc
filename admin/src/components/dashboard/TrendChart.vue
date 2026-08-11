<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  points: { type: Array, default: () => [] }, // [{ date, totalSeconds }]
})

const maxValue = computed(() => Math.max(1, ...props.points.map((p) => p.totalSeconds)))

function barHeight(value) {
  return Math.max(2, Math.round((value / maxValue.value) * 56))
}

function formatDay(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

function formatMinutes(seconds) {
  return Math.round(seconds / 60)
}
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-4">
    <h3 class="text-sm font-semibold text-ink">{{ title }}</h3>

    <div v-if="points.length === 0" class="mt-4 text-sm text-ink-faint">—</div>

    <div v-else class="mt-4 flex items-end gap-1.5" style="height: 64px">
      <div
        v-for="p in points"
        :key="p.date"
        class="group relative flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
        :style="{ height: `${barHeight(p.totalSeconds)}px` }"
        :title="`${formatDay(p.date)}: ${formatMinutes(p.totalSeconds)} min`"
      />
    </div>
    <div class="mt-1.5 flex justify-between text-xs text-ink-faint">
      <span>{{ points[0] ? formatDay(points[0].date) : '' }}</span>
      <span>{{ points[points.length - 1] ? formatDay(points[points.length - 1].date) : '' }}</span>
    </div>
  </div>
</template>
