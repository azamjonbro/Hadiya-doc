<script setup>
import Icon from './Icon.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: 'max-w-xl' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-default"
      enter-from-class="opacity-0"
      leave-active-class="transition-default"
      leave-to-class="opacity-0"
    >
      <div v-if="modelValue" class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" @click="$emit('update:modelValue', false)" />
        <Transition
          enter-active-class="transition-default duration-250"
          enter-from-class="translate-x-full"
          leave-active-class="transition-default duration-200"
          leave-to-class="translate-x-full"
        >
          <div
            v-if="modelValue"
            class="absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-surface shadow-lg"
            :class="width"
          >
            <div class="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 class="text-h3 text-ink">{{ title }}</h2>
              <button
                type="button"
                class="rounded-md p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
                @click="$emit('update:modelValue', false)"
              >
                <Icon name="close" size="18" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-5">
              <slot />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
