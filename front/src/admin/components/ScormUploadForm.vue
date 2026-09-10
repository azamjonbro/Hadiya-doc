<script setup>
/**
 * Uploading a SCORM package.
 *
 * Deliberately thinner than the material upload form: there is nothing to
 * choose. The version, the launch file and the mastery score are read from
 * the manifest by the server, because those are facts about the export
 * rather than decisions an author should be asked to make — and an author
 * who guesses "2004" for a 1.2 package would get content that reports
 * nothing.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { scormApi } from '@/services/scorm'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import FileDropzone from '@/components/ui/FileDropzone.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'

const props = defineProps({ topicId: { type: String, required: true } })
const emit = defineEmits(['created', 'cancel'])

const { t } = useI18n()
const toast = useToast()

const file = ref(null)
const title = ref('')
const required = ref(true)
const uploading = ref(false)
const percent = ref(0)

const sizeLabel = computed(() => {
  if (!file.value) return ''
  const mb = file.value.size / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(file.value.size / 1024)} KB`
})

function pick(selected) {
  file.value = selected
  // The archive's name is the obvious default title, and the manifest's own
  // title replaces it server-side when the author does not type one.
  if (!title.value) title.value = selected.name.replace(/\.zip$/i, '')
}

async function upload() {
  if (!file.value || uploading.value) return
  uploading.value = true
  percent.value = 0
  try {
    const created = await scormApi.upload(
      props.topicId,
      { file: file.value, title: title.value.trim(), required: required.value },
      (event) => {
        if (event.total) percent.value = Math.round((event.loaded / event.total) * 100)
      }
    )
    // The row exists now with PENDING on it; the panel polls until the
    // worker has unpacked it.
    emit('created', created)
    file.value = null
    title.value = ''
  } catch (error) {
    toast.error(apiErrorText(error, t('scorm.uploadFailed')))
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="mt-3 rounded-lg border border-border-strong bg-surface p-4">
    <FileDropzone
      v-if="!file"
      accept=".zip,application/zip,application/x-zip-compressed"
      :title="t('scorm.dropHint')"
      :hint="t('scorm.browse')"
      @select="pick"
    />

    <div v-else class="space-y-3">
      <p class="text-small font-medium text-ink">
        {{ file.name }} <span class="text-ink-faint">({{ sizeLabel }})</span>
      </p>
      <AppInput v-model="title" :label="t('admin.courses.fields.title')" />
      <label class="flex items-center gap-2 text-small text-ink">
        <input v-model="required" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
        {{ t('scorm.required') }}
      </label>

      <ProgressBar v-if="uploading" :value="percent" />

      <div class="flex gap-2">
        <AppButton :loading="uploading" icon="upload" @click="upload">{{ t('scorm.startUpload') }}</AppButton>
        <AppButton variant="ghost" :disabled="uploading" @click="emit('cancel')">{{ t('courses.cancel') }}</AppButton>
      </div>
      <p class="text-caption text-ink-faint">{{ t('scorm.manifestNote') }}</p>
    </div>
  </div>
</template>
