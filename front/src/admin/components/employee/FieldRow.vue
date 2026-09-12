<script setup>
/**
 * One row of the employee form as the reference draws it: the label on the
 * left, the control on the right, one field per line. The control gets no
 * label of its own — pass it `aria-label` with the same text, so the row
 * reads the same to a screen reader as it looks.
 */
defineProps({
  label: { type: String, required: true },
  required: { type: Boolean, default: false },
})
</script>

<template>
  <div class="grid grid-cols-1 gap-y-1 sm:grid-cols-[200px_minmax(0,400px)] sm:items-start sm:gap-x-6">
    <span class="text-small text-ink-muted sm:pt-2.5">
      <span v-if="required" class="text-danger" aria-hidden="true">* </span>{{ label }}
    </span>
    <div class="min-w-0"><slot /></div>
  </div>
</template>
