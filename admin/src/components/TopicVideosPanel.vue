<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { videosApi } from '@/services/videos'
import { useVideoUpload } from '@/composables/useVideoUpload'

const props = defineProps({ topicId: { type: String, required: true } })

const { t } = useI18n()
const auth = useAuthStore()

const videos = ref([])
const loading = ref(true)
const errorMessage = ref('')
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
    // onSuccess only confirms the bytes landed — the Video doc is created
    // by the server's onUploadFinish hook around the same time, so give it
    // a beat before refetching the list.
    if (value === 'success') {
      selectedFile.value = null
      uploadForm.title = ''
      uploadForm.description = ''
      setTimeout(load, 500)
    }
  }
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

onMounted(load)
</script>

<template>
  <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
    <p class="text-sm font-medium">{{ t('videos.title') }}</p>

    <p v-if="errorMessage" class="mt-2 text-sm text-red-500">{{ errorMessage }}</p>

    <ul v-if="videos.length > 0" class="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
      <li v-for="video in videos" :key="video.id" class="flex items-center justify-between py-2 text-sm">
        <div>
          <p class="font-medium">{{ video.title }}</p>
          <p class="text-slate-500 dark:text-slate-400">
            {{ formatSize(video.fileSize) }} · {{ t(`videos.processing.${video.processingStatus}`) }} ·
            {{ video.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
          </p>
        </div>
        <div v-if="auth.hasPermission('video:manage')" class="flex gap-2">
          <button type="button" class="text-xs underline" @click="toggleStatus(video)">
            {{ video.status === 'PUBLISHED' ? t('videos.unpublish') : t('videos.publish') }}
          </button>
          <button type="button" class="text-xs text-red-500 underline" @click="removeVideo(video)">
            {{ t('videos.remove') }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else-if="!loading" class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ t('videos.empty') }}</p>

    <div v-if="auth.hasPermission('video:upload')" class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div
        class="rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors"
        :class="isDragOver ? 'border-slate-500 bg-slate-100 dark:bg-slate-800' : 'border-slate-300 dark:border-slate-700'"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="onDrop"
      >
        <p v-if="!selectedFile" class="text-slate-500 dark:text-slate-400">
          {{ t('videos.dropHint') }}
          <label class="cursor-pointer font-medium text-slate-900 underline dark:text-white">
            {{ t('videos.browse') }}
            <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm" class="hidden" @change="onFileInputChange" />
          </label>
        </p>
        <div v-else class="space-y-2 text-left">
          <p class="font-medium">{{ selectedFile.name }} ({{ formatSize(selectedFile.size) }})</p>
          <input v-model="uploadForm.title" required :placeholder="t('courses.fields.title')" class="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
          <div class="flex items-center gap-3">
            <input v-model.number="uploadForm.order" type="number" :placeholder="t('courses.topics.order')" class="w-24 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
            <label class="flex items-center gap-2 text-sm">
              <input v-model="uploadForm.required" type="checkbox" />
              {{ t('videos.required') }}
            </label>
          </div>

          <div v-if="upload.status.value === 'idle'" class="flex gap-2">
            <button type="button" class="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-slate-900" @click="startUpload">
              {{ t('videos.startUpload') }}
            </button>
            <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" @click="selectedFile = null">
              {{ t('courses.cancel') }}
            </button>
          </div>

          <div v-else-if="upload.status.value === 'uploading' || upload.status.value === 'paused'">
            <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div class="h-full bg-slate-900 dark:bg-white" :style="{ width: `${upload.progress.value}%` }" />
            </div>
            <div class="mt-2 flex items-center gap-2 text-xs">
              <span>{{ upload.progress.value }}%</span>
              <button v-if="upload.status.value === 'uploading'" type="button" class="underline" @click="upload.pause">{{ t('videos.pause') }}</button>
              <button v-else type="button" class="underline" @click="upload.resume">{{ t('videos.resume') }}</button>
              <button type="button" class="text-red-500 underline" @click="upload.cancel">{{ t('videos.cancelUpload') }}</button>
            </div>
          </div>

          <p v-else-if="upload.status.value === 'error'" class="text-sm text-red-500">
            {{ upload.errorMessage.value }}
            <button type="button" class="ml-2 underline" @click="upload.cancel">{{ t('videos.retry') }}</button>
          </p>

          <p v-else-if="upload.status.value === 'success'" class="text-sm text-emerald-500">{{ t('videos.uploadDone') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
