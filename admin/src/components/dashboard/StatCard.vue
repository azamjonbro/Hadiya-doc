<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  suffix: { type: String, default: '' },
})
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-4">
    <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">{{ label }}</p>
    <p class="mt-1.5 text-2xl font-semibold tracking-tight text-ink">
      {{ value }}<span v-if="suffix" class="text-base font-normal text-ink-muted">{{ suffix }}</span>
    </p>
  </div>
</template>
