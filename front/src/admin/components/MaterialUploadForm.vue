<script setup>
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMaterialUpload } from '@/composables/useMaterialUpload'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  topicId: { type: String, required: true },
  contentType: { type: String, required: true }, // FILE | PRESENTATION | MULTIMEDIA
  nextOrder: { type: Number, default: 0 },
})
const emit = defineEmits(['created', 'cancel'])

const { t } = useI18n()
const upload = useMaterialUpload()

const ACCEPT_BY_TYPE = {
  FILE: '.pdf,.docx,.xlsx',
  PRESENTATION: '.pptx,.pdf',
  MULTIMEDIA: '.mp3,.wav,.ogg,.oga,.opus,.m4a',
}

const selectedFile = ref(null)
const form = reactive({ title: '', description: '' })

function onFileInputChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  selectedFile.value = file
  if (!form.title) form.title = file.name.replace(/\.[^.]+$/, '')
}

async function submit() {
  if (!selectedFile.value || !form.title) return
  const material = await upload.start(props.topicId, {
    type: props.contentType,
    title: form.title,
    description: form.description,
    order: props.nextOrder,
    file: selectedFile.value,
  })
  if (material) emit('created', material)
}
</script>

<template>
  <div class="rounded-lg border border-border-strong bg-surface p-3">
    <template v-if="upload.status.value !== 'uploading'">
      <label class="flex cursor-pointer items-center gap-2 text-small text-ink-muted">
        <Icon name="upload" size="16" class="shrink-0 text-ink-faint" />
        <span v-if="!selectedFile">{{ t('materials.browse') }}</span>
        <span v-else class="truncate font-medium text-ink">{{ selectedFile.name }}</span>
        <input type="file" :accept="ACCEPT_BY_TYPE[contentType]" class="hidden" @change="onFileInputChange" />
      </label>

      <div v-if="selectedFile" class="mt-3 space-y-2">
        <AppInput v-model="form.title" required :label="t('materials.titleLabel')" />
        <AppInput v-model="form.description" :label="t('courses.fields.description')" />
        <p v-if="upload.status.value === 'error'" class="text-small text-danger">{{ upload.errorMessage.value }}</p>
        <div class="flex gap-2">
          <AppButton size="sm" @click="submit">{{ t('materials.upload') }}</AppButton>
          <AppButton size="sm" variant="ghost" @click="emit('cancel')">{{ t('courses.cancel') }}</AppButton>
        </div>
      </div>
    </template>

    <div v-else class="space-y-2">
      <p class="text-small text-ink-muted">{{ t('materials.uploading') }}</p>
      <ProgressBar :value="upload.progress.value" />
    </div>
  </div>
</template>
