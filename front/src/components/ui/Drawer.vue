<script setup>
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '@/composables/useFocusTrap'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: 'max-w-xl' },
  // A panel whose first thing is a picture (the profile drawer) has no
  // room for a title bar: the caller draws its own close button and takes
  // the full height, padding included.
  plain: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const panel = ref(null)
const titleId = `${useId()}-title`
const labelledBy = computed(() => (props.title ? titleId : undefined))

function close() {
  emit('update:modelValue', false)
}

// The same trap as Modal: a drawer covers the page, so Tab has to stay
// inside it and Escape has to close it (12.4).
// Focus starts on the panel, not on the first control in it — which is
// the close button, since it sits first in the header. Landing on "Close"
// is a strange way to open a dialog; landing on the panel makes a screen
// reader announce the dialog and its title, and the first Tab then walks
// into the content in the order it is read.
useFocusTrap(panel, {
  isActive: () => props.modelValue,
  onEscape: close,
  initialFocus: () => panel.value,
})
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
        <div class="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" aria-hidden="true" @click="close" />
        <Transition
          enter-active-class="transition-default duration-250"
          enter-from-class="translate-x-full"
          leave-active-class="transition-default duration-200"
          leave-to-class="translate-x-full"
        >
          <div
            v-if="modelValue"
            ref="panel"
            class="absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-surface shadow-lg"
            :class="width"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="labelledBy"
            :aria-label="title ? undefined : t('a11y.panel')"
            tabindex="-1"
          >
            <div v-if="!plain" class="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 :id="titleId" class="text-h3 text-ink">{{ title }}</h2>
              <button
                type="button"
                class="rounded-md p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
                :aria-label="t('a11y.closeDialog')"
                @click="close"
              >
                <Icon name="close" size="18" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto" :class="plain ? '' : 'px-6 py-5'">
              <slot />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
