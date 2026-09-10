<script setup>
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  size: { type: String, default: 'md' }, // sm | md | lg | xl
})

defineEmits(['update:modelValue'])

// xl is for the things that are genuinely wide — a report preview is a
// nine-column table, and squeezing it into 2xl turns every cell into a
// two-line wrap. It stays inside the viewport on a phone because the width
// is a max, not a fixed size.
const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-default"
      enter-from-class="opacity-0"
      leave-active-class="transition-default"
      leave-to-class="opacity-0"
    >
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" @click="$emit('update:modelValue', false)" />
        <Transition
          enter-active-class="transition-default"
          enter-from-class="opacity-0 scale-95"
          leave-active-class="transition-default"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="modelValue"
            class="relative flex max-h-[90vh] w-full flex-col rounded-xl border border-border bg-surface p-4 shadow-lg sm:p-6"
            :class="sizes[size]"
            role="dialog"
            aria-modal="true"
          >
            <div class="flex shrink-0 items-start justify-between">
              <div>
                <h2 v-if="title" class="text-h3 text-ink">{{ title }}</h2>
                <p v-if="description" class="mt-1 text-small text-ink-muted">{{ description }}</p>
              </div>
              <button
                type="button"
                class="-mr-1 -mt-1 rounded-md p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
                @click="$emit('update:modelValue', false)"
              >
                <Icon name="close" size="18" />
              </button>
            </div>
            <div class="mt-4 min-h-0 flex-1 overflow-y-auto">
              <slot />
            </div>
            <div v-if="$slots.footer" class="mt-6 flex shrink-0 items-center justify-end gap-2">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
