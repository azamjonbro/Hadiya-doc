<script setup>
/**
 * The white strip under a hero (reference §1): tabs on the left, search
 * on the right, full width, 70px, with the content column inside.
 */
</script>

<template>
  <div class="w-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
    <div class="mx-auto flex min-h-[70px] w-full max-w-[1140px] flex-wrap items-center gap-3 px-4 py-3">
      <slot />
    </div>
  </div>
</template>
