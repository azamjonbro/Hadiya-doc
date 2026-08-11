<script setup>
defineProps({
  modelValue: { type: String, required: true },
  tabs: { type: Array, required: true }, // [{ value, label, count }]
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto border-b border-border">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="relative flex shrink-0 items-center gap-1.5 px-3.5 py-2.5 text-small font-medium transition-default"
      :class="modelValue === tab.value ? 'text-ink' : 'text-ink-muted hover:text-ink'"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
      <span
        v-if="tab.count !== undefined"
        class="rounded-full px-1.5 py-0.5 text-caption"
        :class="modelValue === tab.value ? 'bg-primary-subtle text-primary' : 'bg-surface-2 text-ink-faint'"
      >
        {{ tab.count }}
      </span>
      <span
        class="absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-default"
        :class="modelValue === tab.value ? 'bg-primary' : 'bg-transparent'"
      />
    </button>
  </div>
</template>
