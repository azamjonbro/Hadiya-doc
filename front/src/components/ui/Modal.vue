<script setup>
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '@/composables/useFocusTrap'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  size: { type: String, default: 'md' }, // sm | md | lg | xl
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

// xl is for the things that are genuinely wide — a report preview is a
// nine-column table, and squeezing it into 2xl turns every cell into a
// two-line wrap. It stays inside the viewport on a phone because the width
// is a max, not a fixed size.
const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }

const panel = ref(null)
const baseId = useId()
const titleId = `${baseId}-title`
const descriptionId = `${baseId}-description`

// `aria-modal` alone does not name the dialog — without this a screen
// reader announces "dialog" and nothing else, and the person has to go
// looking for what it is about (12.4).
const labelledBy = computed(() => (props.title ? titleId : undefined))
const describedBy = computed(() => (props.description ? descriptionId : undefined))

function close() {
  emit('update:modelValue', false)
}

// Escape closes. It did not before: every caller (ConfirmDialog included)
// assumed it did, because that is what a dialog does everywhere else.
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
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Decorative: the same "close" is reachable by keyboard through
             the X button and Escape, so the backdrop is hidden from the
             accessibility tree rather than announced as an unlabelled
             clickable region. -->
        <div class="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" aria-hidden="true" @click="close" />
        <Transition
          enter-active-class="transition-default"
          enter-from-class="opacity-0 scale-95"
          leave-active-class="transition-default"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="modelValue"
            ref="panel"
            class="relative flex max-h-[90vh] w-full flex-col rounded-xl border border-border bg-surface p-4 shadow-lg sm:p-6"
            :class="sizes[size]"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="labelledBy"
            :aria-describedby="describedBy"
            :aria-label="title ? undefined : t('a11y.dialog')"
            tabindex="-1"
          >
            <div class="flex shrink-0 items-start justify-between">
              <div>
                <h2 v-if="title" :id="titleId" class="text-h3 text-ink">{{ title }}</h2>
                <p v-if="description" :id="descriptionId" class="mt-1 text-small text-ink-muted">{{ description }}</p>
              </div>
              <button
                type="button"
                class="-mr-1 -mt-1 rounded-md p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
                :aria-label="t('a11y.closeDialog')"
                @click="close"
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
