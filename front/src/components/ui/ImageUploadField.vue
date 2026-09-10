<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { uploadsApi } from '@/services/uploads'
import { useToast } from '@/composables/useToast'
import Icon from './Icon.vue'
import MediaPicker from './MediaPicker.vue'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  aspect: { type: String, default: 'aspect-video' }, // any Tailwind aspect-* class for the preview box
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const toast = useToast()
const fileInput = ref(null)
const uploading = ref(false)
// The library (9.5): the same image is otherwise uploaded once per place
// it appears, because there was no way to find the one already stored.
const picking = ref(false)

function pick() {
  if (!props.disabled && !uploading.value) fileInput.value?.click()
}

async function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // allow re-selecting the same file later
  if (!file) return

  uploading.value = true
  try {
    const { url } = await uploadsApi.image(file)
    emit('update:modelValue', url)
  } catch (error) {
    toast.error(apiErrorText(error, t('imageUpload.error')))
  } finally {
    uploading.value = false
  }
}

function clear() {
  emit('update:modelValue', '')
}

function pickFromLibrary(asset) {
  picking.value = false
  emit('update:modelValue', asset.url)
}
</script>

<template>
  <div>
    <label v-if="label" class="mb-1.5 block text-small font-medium text-ink">{{ label }}</label>

    <div
      class="relative flex items-center justify-center overflow-hidden rounded-md border border-dashed border-border-strong bg-surface-2"
      :class="[aspect, disabled ? 'opacity-50' : 'hover:border-primary']"
    >
      <!-- The preview names itself, so it is announced as the picked image
           rather than as a second, unnamed graphic. -->
      <img v-if="modelValue" :src="modelValue" :alt="t('imageUpload.preview')" class="h-full w-full object-cover" />
      <div v-else class="flex flex-col items-center gap-1.5 py-6 text-ink-faint">
        <Icon name="upload" size="20" />
        <span class="text-caption">{{ t('imageUpload.choose') }}</span>
      </div>

      <!-- The whole box is the control, and it is a real <button> covering
           it rather than a <div role="button"> around everything (12.4).
           The div version was reachable by keyboard but wrapped the clear
           button and the file input, i.e. controls nested inside a control
           — which is ambiguous to a screen reader and is what axe flags as
           `nested-interactive`. As a sibling overlay it owns the click, the
           Enter/Space handling and the focus ring for free, and the clear
           button above it stays its own control. -->
      <button
        type="button"
        class="absolute inset-0 z-10 h-full w-full cursor-pointer"
        :class="disabled ? 'cursor-not-allowed' : ''"
        :disabled="disabled || uploading"
        :aria-label="label || t('imageUpload.choose')"
        :aria-busy="uploading"
        @click="pick"
      />

      <div v-if="uploading" class="absolute inset-0 z-20 flex items-center justify-center bg-surface/80">
        <Icon name="loader" size="20" class="animate-spin text-primary" />
      </div>

      <button
        v-if="modelValue && !disabled && !uploading"
        type="button"
        class="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-surface text-ink-muted shadow-sm hover:text-danger"
        :aria-label="t('imageUpload.clear')"
        @click.stop="clear"
      >
        <Icon name="close" size="14" />
      </button>
    </div>

    <!-- The second way in. Not a replacement for the dropzone above: a
         first upload has nothing to pick from, and an author with the file
         in hand should not have to visit a library first. -->
    <button
      v-if="!disabled"
      type="button"
      class="mt-1.5 flex items-center gap-1 text-caption text-ink-muted transition-default hover:text-ink"
      @click="picking = true"
    >
      <Icon name="image" size="12" />
      {{ t('media.pickFromLibrary') }}
    </button>

    <!-- Opened by the button above, never reached directly: hidden from
         the accessibility tree and out of the tab order, or it is announced
         as a form field with no label. -->
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      class="hidden"
      tabindex="-1"
      aria-hidden="true"
      :disabled="disabled"
      @change="onFileChange"
    />

    <MediaPicker :open="picking" @close="picking = false" @pick="pickFromLibrary" />
  </div>
</template>
