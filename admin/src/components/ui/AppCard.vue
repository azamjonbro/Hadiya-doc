<script setup>
defineProps({
  padding: { type: String, default: 'md' }, // none | sm | md | lg
  hover: { type: Boolean, default: false },
  as: { type: String, default: 'div' },
})

const paddings = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }
</script>

<template>
  <component
    :is="as"
    class="rounded-lg border border-border bg-surface transition-default"
    :class="[paddings[padding], hover ? 'hover:border-border-strong hover:shadow-sm' : '']"
  >
    <slot />
  </component>
</template>
