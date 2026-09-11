<script setup>
/**
 * Tabs as pills (reference §1, §10): the active one sits on a grey pill,
 * the rest are plain text. Counts follow the label in brackets, the way
 * "Назначенные (16)" reads on the reference.
 */
defineProps({
  modelValue: { type: String, required: true },
  tabs: { type: Array, required: true }, // [{ value, label, count? }]
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.value"
      class="rounded-full px-4 py-2 text-[14px] transition-default"
      :class="modelValue === tab.value ? 'bg-surface-hover font-medium text-ink' : 'text-ink-muted hover:text-ink'"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}<template v-if="tab.count !== undefined"> ({{ tab.count }})</template>
    </button>
  </div>
</template>
