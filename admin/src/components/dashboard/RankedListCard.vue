<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, default: () => [] }, // [{ label, value, sublabel? }]
  emptyText: { type: String, default: '' },
  valueSuffix: { type: String, default: '' },
})

const maxValue = computed(() => Math.max(1, ...props.items.map((i) => Number(i.value) || 0)))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-4">
    <h3 class="text-sm font-semibold text-ink">{{ title }}</h3>

    <p v-if="items.length === 0" class="mt-4 text-sm text-ink-faint">{{ emptyText }}</p>

    <ul v-else class="mt-3 space-y-2.5">
      <li v-for="(item, i) in items" :key="i">
        <div class="flex items-center justify-between text-sm">
          <span class="truncate text-ink" :title="item.label">{{ item.label }}</span>
          <span class="shrink-0 pl-2 text-ink-muted">{{ item.value }}{{ valueSuffix }}</span>
        </div>
        <div v-if="item.sublabel" class="text-xs text-ink-faint">{{ item.sublabel }}</div>
        <div class="mt-1 h-1.5 rounded-full bg-surface-2">
          <div
            class="h-1.5 rounded-full bg-primary"
            :style="{ width: `${Math.max(2, ((Number(item.value) || 0) / maxValue) * 100)}%` }"
          />
        </div>
      </li>
    </ul>
  </div>
</template>
