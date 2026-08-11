<script setup>
import { ref } from 'vue'

defineProps({ text: { type: String, required: true }, position: { type: String, default: 'top' } })
const visible = ref(false)

const positions = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}
</script>

<template>
  <span class="relative inline-flex" @mouseenter="visible = true" @mouseleave="visible = false" @focusin="visible = true" @focusout="visible = false">
    <slot />
    <Transition enter-active-class="transition-default" enter-from-class="opacity-0" leave-active-class="transition-default" leave-to-class="opacity-0">
      <span
        v-if="visible"
        role="tooltip"
        class="pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-caption font-medium text-bg shadow-md"
        :class="positions[position]"
      >
        {{ text }}
      </span>
    </Transition>
  </span>
</template>
