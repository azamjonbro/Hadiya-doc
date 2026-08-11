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

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-hover border border-border',
  outline: 'bg-transparent text-ink border border-border-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90 shadow-xs',
}

const sizes = {
  sm: 'h-8 px-3 text-small gap-1.5',
  md: 'h-9.5 px-4 text-body gap-2',
  lg: 'h-11 px-5 text-body gap-2',
}

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-md font-medium transition-default select-none',
  'disabled:opacity-50 disabled:pointer-events-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  variants[props.variant],
  sizes[props.size],
  props.block ? 'w-full' : '',
])
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading">
    <Icon v-if="loading" name="loader" size="16" class="animate-spin" />
    <Icon v-else-if="icon && iconPosition === 'left'" :name="icon" size="16" />
    <slot />
    <Icon v-if="!loading && icon && iconPosition === 'right'" :name="icon" size="16" />
  </button>
</template>
