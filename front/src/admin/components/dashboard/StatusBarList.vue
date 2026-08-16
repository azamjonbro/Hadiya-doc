<script setup>
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, default: () => [] }, // [{ label, value, tone, icon }]
  emptyText: { type: String, default: '' },
})

const maxValue = computed(() => Math.max(1, ...props.items.map((i) => Number(i.value) || 0)))

const toneBar = {
  neutral: 'bg-ink-faint',
  info: 'bg-info',
  success: 'bg-success',
  danger: 'bg-danger',
}
const toneChip = {
  neutral: 'bg-surface-2 text-ink-faint',
  info: 'bg-info-subtle text-info',
  success: 'bg-success-subtle text-success',
  danger: 'bg-danger-subtle text-danger',
}
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <h3 class="text-small font-semibold text-ink">{{ title }}</h3>
    <p v-if="items.length === 0" class="mt-4 text-small text-ink-faint">{{ emptyText }}</p>
    <ul v-else class="mt-4 space-y-3">
      <li v-for="item in items" :key="item.label">
        <div class="flex items-center justify-between text-small">
          <span class="flex items-center gap-1.5 text-ink">
            <span class="flex h-5 w-5 items-center justify-center rounded" :class="toneChip[item.tone]">
              <Icon :name="item.icon" size="11" />
            </span>
            {{ item.label }}
          </span>
          <span class="font-medium text-ink-muted">{{ item.value }}</span>
        </div>
        <div class="mt-1.5 h-1.5 rounded-full bg-surface-2">
          <div class="h-1.5 rounded-full" :class="toneBar[item.tone]" :style="{ width: `${Math.max(2, (Number(item.value) / maxValue) * 100)}%` }" />
        </div>
      </li>
    </ul>
  </div>
</template>
