<script setup>
import Icon from './Icon.vue'

defineProps({
  code: { type: String, default: '' },
  icon: { type: String, default: 'alert-triangle' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>

<template>
  <div class="flex min-h-full flex-col items-center justify-center px-6 py-24 text-center">
    <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
      <Icon :name="icon" size="28" />
    </div>
    <p v-if="code" class="mt-6 text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ code }}</p>
    <h1 class="mt-2 text-h1 text-ink">{{ title }}</h1>
    <p v-if="description" class="mt-2 max-w-md text-body text-ink-muted">{{ description }}</p>
    <div class="mt-7 flex items-center gap-3">
      <slot name="actions" />
    </div>
  </div>
</template>
