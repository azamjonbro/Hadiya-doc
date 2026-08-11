<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, required: true }, // 0-100
  variant: { type: String, default: 'primary' }, // primary | success | warning | danger
  size: { type: String, default: 'md' }, // sm | md
})

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))

const colors = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}
</script>

<template>
  <div class="w-full overflow-hidden rounded-full bg-surface-2" :class="size === 'sm' ? 'h-1.5' : 'h-2'">
    <div
      class="h-full rounded-full transition-[width] duration-500 ease-out"
      :class="colors[variant]"
      :style="{ width: clamped + '%' }"
    />
  </div>
</template>
