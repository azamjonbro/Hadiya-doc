<script setup>
defineProps({
  as: { type: String, default: 'div' },
  rounded: { type: String, default: 'rounded-md' },
})
</script>

<template>
  <component :is="as" class="animate-pulse bg-surface-2" :class="rounded">
    <slot />
  </component>
</template>
