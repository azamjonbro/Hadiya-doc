<script setup>
import { ref } from 'vue'
import Icon from './Icon.vue'

/**
 * Pick a file, or drop one on it.
 *
 * Three places take a file upload and only one of them accepted a drop: the
 * video panel wrote the drag handlers by hand, while the material form and
 * the import wizard were a hidden <input> behind a label, so dragging a file
 * onto them did nothing — and, since the browser navigates to a file dropped
 * anywhere else on the page, "nothing" meant the admin lost the screen they
 * were filling in.
 *
 * The element is a real <button>, so it is reachable by keyboard and
 * announces itself. The file input is **created on the spot** rather than
 * living hidden inside that button: a focusable, unlabelled control nested
 * inside a control is ambiguous to a screen reader (axe's
 * `nested-interactive`), and hiding it with `aria-hidden` does not change
 * that it is still focusable. A fresh input per click also drops the
 * "clear the value so the same file fires change twice" workaround — there
 * is no previous value to clear (12.4).
 */
const props = defineProps({
  accept: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  icon: { type: String, default: 'upload' },
  title: { type: String, default: '' },
  hint: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const isDragOver = ref(false)

function open() {
  if (props.disabled) return
  const input = document.createElement('input')
  input.type = 'file'
  if (props.accept) input.accept = props.accept
  input.multiple = props.multiple
  input.addEventListener('change', () => take(input.files), { once: true })
  input.click()
}

function take(fileList) {
  const files = [...(fileList ?? [])]
  if (!files.length) return
  emit('select', props.multiple ? files : files[0])
}

function onDrop(event) {
  isDragOver.value = false
  if (!props.disabled) take(event.dataTransfer?.files)
}
</script>

<template>
  <button
    type="button"
    class="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-default"
    :class="[
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary hover:bg-surface-2',
      isDragOver ? 'border-primary bg-primary-subtle/40' : 'border-border-strong',
    ]"
    :disabled="disabled"
    @click="open"
    @dragover.prevent="!disabled && (isDragOver = true)"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="onDrop"
  >
    <slot :is-drag-over="isDragOver">
      <span class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
        <Icon :name="icon" size="18" />
      </span>
      <span v-if="title" class="text-small font-medium text-ink">{{ title }}</span>
      <span v-if="hint" class="text-caption text-ink-faint">{{ hint }}</span>
    </slot>

  </button>
</template>
