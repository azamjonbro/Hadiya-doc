<script setup>
import { useToast } from '@/composables/useToast'
import Icon from './Icon.vue'

const { toasts, dismiss } = useToast()

const icon = { success: 'check-circle', danger: 'alert-circle', warning: 'alert-triangle', info: 'info' }
const iconColor = {
  success: 'text-success bg-success-subtle',
  danger: 'text-danger bg-danger-subtle',
  warning: 'text-warning bg-warning-subtle',
  info: 'text-info bg-info-subtle',
}
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2">
      <TransitionGroup
        enter-active-class="transition-default"
        enter-from-class="opacity-0 translate-x-3"
        leave-active-class="transition-default"
        leave-to-class="opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-lg"
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" :class="iconColor[toast.variant]">
            <Icon :name="icon[toast.variant]" size="14" />
          </span>
          <p class="flex-1 pt-0.5 text-small text-ink">{{ toast.message }}</p>
          <button type="button" class="text-ink-faint hover:text-ink" @click="dismiss(toast.id)">
            <Icon name="close" size="15" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
