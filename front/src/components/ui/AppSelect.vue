<script setup>
import Icon from './Icon.vue'

defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  options: { type: Array, default: () => [] }, // [{ value, label }]
  placeholder: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div>
    <label v-if="label" class="mb-1.5 block text-small font-medium text-ink">{{ label }}</label>
    <div class="relative">
      <select
        class="h-10.5 w-full appearance-none rounded-md border border-border-strong bg-surface pl-3.5 pr-9 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
        :value="modelValue"
        @change="$emit('update:modelValue', $event.target.value)"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <Icon name="chevron-down" size="16" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
    </div>
  </div>
</template>
