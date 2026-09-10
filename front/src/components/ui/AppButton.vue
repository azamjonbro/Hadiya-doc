<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  variant: { type: String, default: 'primary' }, // primary | secondary | outline | ghost | danger
  size: { type: String, default: 'md' }, // sm | md | lg
  icon: { type: String, default: '' },
  iconPosition: { type: String, default: 'left' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
})

// Frosted-glass surface: translucent fill + backdrop blur + a thin inset
// top highlight (the glass "sheen"). Definition comes from a soft ring +
// tinted glow in the button's own accent color at low alpha, rather than a
// hard dark drop-shadow — reads calm in both themes instead of a blown-out
// neon edge (the thing that actually strains eyes). Every class below is a
// complete literal string — Tailwind's scanner can't see classes built by
// runtime string interpolation, so nothing here is assembled from parts.
const variants = {
  primary: 'bg-primary text-white font-medium hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-ink font-medium border border-border-strong hover:bg-surface-2 shadow-sm',
  outline: 'bg-transparent text-primary font-medium border border-primary hover:bg-primary-subtle',
  ghost: 'bg-transparent text-ink-muted font-medium hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-white font-medium hover:bg-red-700 shadow-sm',
}

const sizes = {
  sm: 'h-8 px-3.5 text-small gap-1.5',
  md: 'h-9.5 px-5 text-body gap-2',
  lg: 'h-11 px-6 text-body gap-2.5',
}

const iconSizes = { sm: '14', md: '16', lg: '18' }

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-md transition-default select-none',
  'active:scale-[0.97]',
  'disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  variants[props.variant],
  sizes[props.size],
  props.block ? 'w-full' : '',
])

const iconSize = computed(() => iconSizes[props.size])
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading">
    <Icon v-if="loading" name="loader" :size="iconSize" class="animate-spin" />
    <Icon v-else-if="icon && iconPosition === 'left'" :name="icon" :size="iconSize" />
    <slot />
    <Icon v-if="!loading && icon && iconPosition === 'right'" :name="icon" :size="iconSize" />
  </button>
</template>
