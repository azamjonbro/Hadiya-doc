<script setup>
import Icon from './Icon.vue'

defineProps({
  icon: { type: String, default: 'layers' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
      <Icon :name="icon" size="22" />
    </div>
    <h3 class="mt-4 text-h3 text-ink">{{ title }}</h3>
    <p v-if="description" class="mt-1.5 max-w-sm text-small text-ink-muted">{{ description }}</p>
    <div v-if="$slots.action" class="mt-5">
      <slot name="action" />
    </div>
  </div>
</template>
