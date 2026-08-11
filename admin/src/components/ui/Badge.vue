<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: { type: String, default: 'neutral' }, // neutral | primary | success | warning | danger | info
  dot: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // sm | md
})

const variants = {
  neutral: 'bg-surface-2 text-ink-muted border border-border',
  primary: 'bg-primary-subtle text-primary border border-transparent',
  success: 'bg-success-subtle text-success border border-transparent',
  warning: 'bg-warning-subtle text-warning border border-transparent',
  danger: 'bg-danger-subtle text-danger border border-transparent',
  info: 'bg-info-subtle text-info border border-transparent',
}

const dotColor = {
  neutral: 'bg-ink-faint',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
}

const classes = computed(() => [
  'inline-flex items-center rounded-full font-medium',
  props.size === 'sm' ? 'px-2 py-0.5 text-caption' : 'px-2.5 py-1 text-caption',
  variants[props.variant],
])
</script>

<template>
  <span :class="classes">
    <span v-if="dot" class="mr-1.5 h-1.5 w-1.5 rounded-full" :class="dotColor[variant]" />
    <slot />
  </span>
</template>
