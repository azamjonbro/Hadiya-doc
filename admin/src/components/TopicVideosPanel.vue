<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { videosApi } from '@/services/videos'
import { useVideoUpload } from '@/composables/useVideoUpload'
import VideoReportPanel from '@/components/VideoReportPanel.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({ topicId: { type: String, required: true } })

const { t } = useI18n()
const auth = useAuthStore()

const videos = ref([])
const loading = ref(true)
const errorMessage = ref('')
const expandedReportVideoId = ref(null)
const isDragOver = ref(false)

const upload = useVideoUpload()
const selectedFile = ref(null)
const uploadForm = reactive({ title: '', description: '', required: true, order: 0 })

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    videos.value = await videosApi.listByTopic(props.topicId)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

function pickFile(file) {
  if (!file) return
  selectedFile.value = file
  if (!uploadForm.title) uploadForm.title = file.name.replace(/\.[^.]+$/, '')
}

function onFileInputChange(event) {
  pickFile(event.target.files?.[0])
}

function onDrop(event) {
  isDragOver.value = false
  pickFile(event.dataTransfer?.files?.[0])
}

function startUpload() {
  if (!selectedFile.value || !uploadForm.title) return
  upload.start({
    file: selectedFile.value,
    topicId: props.topicId,
    title: uploadForm.title,
    description: uploadForm.description,
    required: uploadForm.required,
    order: uploadForm.order,
  })
}

watch(
  () => upload.status.value,
  (value) => {
    if (value === 'success') {
      selectedFile.value = null
      uploadForm.title = ''
      uploadForm.description = ''
      setTimeout(load, 500)
    }
  },
)

async function toggleStatus(video) {
  const nextStatus = video.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
  const updated = await videosApi.update(video.id, { status: nextStatus })
  videos.value = videos.value.map((v) => (v.id === video.id ? updated : v))
}

async function removeVideo(video) {
  await videosApi.remove(video.id)
  videos.value = videos.value.filter((v) => v.id !== video.id)
}

function formatSize(bytes) {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function formatSpeed(bytesPerSecond) {
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatEta(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const statusMeta = {
  READY: { icon: 'check-circle', variant: 'success' },
  FAILED: { icon: 'alert-circle', variant: 'danger' },
}

onMounted(load)
</script>

<template>
  <div class="mt-3 rounded-lg border border-border bg-surface-2 p-4">
    <p class="text-small font-semibold text-ink">{{ t('videos.title') }}</p>

    <p v-if="errorMessage" class="mt-2 text-small text-danger">{{ errorMessage }}</p>

    <ul v-if="videos.length > 0" class="mt-2 divide-y divide-border">
      <li v-for="video in videos" :key="video.id" class="py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" :class="(statusMeta[video.processingStatus] ?? { variant: 'neutral' }).variant === 'success' ? 'bg-success-subtle text-success' : (statusMeta[video.processingStatus] ?? {}).variant === 'danger' ? 'bg-danger-subtle text-danger' : 'bg-surface text-ink-faint'">
              <Icon :name="statusMeta[video.processingStatus]?.icon ?? 'video'" size="15" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-small font-medium text-ink">{{ video.title }}</p>
              <p class="truncate text-caption text-ink-faint">
                {{ formatSize(video.fileSize) }} · {{ t(`videos.processing.${video.processingStatus}`) }}
              </p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <Badge :variant="video.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
              {{ video.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
            </Badge>
            <AppButton variant="ghost" size="sm" @click="expandedReportVideoId = expandedReportVideoId === video.id ? null : video.id">
              {{ t('videoReport.title') }}
            </AppButton>
            <template v-if="auth.hasPermission('video:manage')">
              <AppButton variant="ghost" size="sm" @click="toggleStatus(video)">
                {{ video.status === 'PUBLISHED' ? t('videos.unpublish') : t('videos.publish') }}
              </AppButton>
              <AppButton variant="ghost" size="sm" icon="trash" @click="removeVideo(video)" />
            </template>
          </div>
        </div>
        <VideoReportPanel v-if="expandedReportVideoId === video.id" :video-id="video.id" />
      </li>
    </ul>
    <p v-else-if="!loading" class="mt-2 text-small text-ink-faint">{{ t('videos.empty') }}</p>

    <div v-if="auth.hasPermission('video:upload')" class="mt-4 border-t border-border pt-4">
      <div
        class="rounded-lg border-2 border-dashed p-6 text-center text-small transition-default"
        :class="isDragOver ? 'border-primary bg-primary-subtle' : 'border-border-strong bg-surface'"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="onDrop"
      >
        <template v-if="!selectedFile">
          <Icon name="upload" size="22" class="mx-auto text-ink-faint" />
          <p class="mt-2 text-ink-muted">
            {{ t('videos.dropHint') }}
            <label class="cursor-pointer font-medium text-primary hover:underline">
              {{ t('videos.browse') }}
              <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm" class="hidden" @change="onFileInputChange" />
            </label>
          </p>
        </template>
        <div v-else class="space-y-3 text-left">
          <p class="text-small font-medium text-ink">{{ selectedFile.name }} <span class="text-ink-faint">({{ formatSize(selectedFile.size) }})</span></p>
          <AppInput v-model="uploadForm.title" required :label="t('courses.fields.title')" />
          <div class="flex items-center gap-4">
            <div class="w-28">
              <AppInput v-model.number="uploadForm.order" type="number" :label="t('courses.topics.order')" />
            </div>
            <label class="mt-5 flex items-center gap-2 text-small text-ink">
              <input v-model="uploadForm.required" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
              {{ t('videos.required') }}
            </label>
          </div>

          <div v-if="upload.status.value === 'idle'" class="flex gap-2">
            <AppButton @click="startUpload">{{ t('videos.startUpload') }}</AppButton>
            <AppButton variant="ghost" @click="selectedFile = null">{{ t('courses.cancel') }}</AppButton>
          </div>

          <div v-else-if="upload.status.value === 'uploading' || upload.status.value === 'paused'">
            <ProgressBar :value="upload.progress.value" />
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-muted">
              <span class="font-medium text-ink">{{ upload.progress.value }}%</span>
              <span v-if="upload.speedBytesPerSecond.value > 0">{{ formatSpeed(upload.speedBytesPerSecond.value) }}</span>
              <span v-if="upload.etaSeconds.value > 0">{{ t('videos.eta') }} {{ formatEta(upload.etaSeconds.value) }}</span>
              <button v-if="upload.status.value === 'uploading'" type="button" class="font-medium text-primary hover:underline" @click="upload.pause">{{ t('videos.pause') }}</button>
              <button v-else type="button" class="font-medium text-primary hover:underline" @click="upload.resume">{{ t('videos.resume') }}</button>
              <button type="button" class="font-medium text-danger hover:underline" @click="upload.cancel">{{ t('videos.cancelUpload') }}</button>
            </div>
          </div>

          <p v-else-if="upload.status.value === 'error'" class="flex items-center gap-2 text-small text-danger">
            {{ upload.errorMessage.value }}
            <button type="button" class="font-medium underline" @click="upload.cancel">{{ t('videos.retry') }}</button>
          </p>

          <p v-else-if="upload.status.value === 'success'" class="flex items-center gap-1.5 text-small text-success">
            <Icon name="check-circle" size="15" />
            {{ t('videos.uploadDone') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
