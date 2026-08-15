<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import { topicsApi } from '@/services/topics'
import { videosApi } from '@/services/videos'
import { materialsApi } from '@/services/materials'
import { assessmentsApi } from '@/services/assessments'
import { useVideoUpload } from '@/composables/useVideoUpload'
import MaterialUploadForm from '@/components/MaterialUploadForm.vue'
import MaterialViewer from '@/components/MaterialViewer.vue'
import AssessmentEditor from '@/components/AssessmentEditor.vue'
import VideoReportPanel from '@/components/VideoReportPanel.vue'
import VideoQuizEditor from '@/components/VideoQuizEditor.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({ topicId: { type: String, required: true } })

const { t } = useI18n()
const auth = useAuthStore()
const confirm = useConfirm()
const canManage = computed(() => auth.hasPermission('video:manage'))
const canUpload = computed(() => auth.hasPermission('video:upload'))

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const expandedReportVideoId = ref(null)
const expandedQuizVideoId = ref(null)
const expandedAssessmentId = ref(null)
const pointsSaving = ref(null)

// 'VIDEO' | 'FILE' | 'PRESENTATION' | 'MULTIMEDIA' | null — which "add
// content" form is currently open.
const addingType = ref(null)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await topicsApi.listContent(props.topicId)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

function nextOrder() {
  return items.value.length ? Math.max(...items.value.map((i) => i.order)) + 1 : 0
}

const ICON_BY_TYPE = {
  FILE: 'paperclip',
  PRESENTATION: 'book-open',
  MULTIMEDIA: 'volume',
  ASSESSMENT: 'check-square',
}

const isVideoProcessing = {
  READY: { icon: 'check-circle', variant: 'success' },
  FAILED: { icon: 'alert-circle', variant: 'danger' },
}

// --- Video upload (unchanged from the old TopicVideosPanel) ---
const upload = useVideoUpload()
const selectedVideoFile = ref(null)
const videoForm = reactive({ title: '', description: '', required: true })
const isDragOver = ref(false)

function pickVideoFile(file) {
  if (!file) return
  selectedVideoFile.value = file
  if (!videoForm.title) videoForm.title = file.name.replace(/\.[^.]+$/, '')
}
function onVideoFileInputChange(event) {
  pickVideoFile(event.target.files?.[0])
}
function onDrop(event) {
  isDragOver.value = false
  pickVideoFile(event.dataTransfer?.files?.[0])
}
function startVideoUpload() {
  if (!selectedVideoFile.value || !videoForm.title) return
  upload.start({
    file: selectedVideoFile.value,
    topicId: props.topicId,
    title: videoForm.title,
    description: videoForm.description,
    required: videoForm.required,
    order: nextOrder(),
  })
}
function cancelVideoAdd() {
  upload.cancel()
  selectedVideoFile.value = null
  videoForm.title = ''
  videoForm.description = ''
  addingType.value = null
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

watch(
  () => upload.status.value,
  (value) => {
    if (value === 'success') {
      selectedVideoFile.value = null
      videoForm.title = ''
      videoForm.description = ''
      addingType.value = null
      setTimeout(load, 500)
    }
  },
)

async function toggleVideoStatus(item) {
  const nextStatus = item.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
  await videosApi.update(item.id, { status: nextStatus })
  load()
}
function onQuizUpdated(item, hasQuiz) {
  item.hasQuiz = hasQuiz
  if (!hasQuiz) expandedQuizVideoId.value = null
}
async function saveVideoPoints(item) {
  pointsSaving.value = item.id
  try {
    await videosApi.update(item.id, { pointsEnabled: item.pointsEnabled, points: item.points })
  } finally {
    pointsSaving.value = null
  }
}
async function removeVideo(item) {
  if (!(await confirm.ask({ message: t('confirm.deleteVideo', { title: item.title }) }))) return
  await videosApi.remove(item.id)
  load()
}

// --- Materials ---
async function toggleMaterialStatus(item) {
  const nextStatus = item.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
  await materialsApi.update(item.id, { status: nextStatus })
  load()
}
async function removeMaterial(item) {
  if (!(await confirm.ask({ message: t('confirm.deleteMaterial', { title: item.title }) }))) return
  await materialsApi.remove(item.id)
  load()
}
// Opening an upload in the same reader the learners get is how a manager
// checks a file before publishing it.
const openMaterial = ref(null)

async function downloadMaterial(item) {
  const { url } = await materialsApi.getDownloadUrl(item.id)
  window.open(url, '_blank', 'noopener')
}
function onMaterialCreated() {
  addingType.value = null
  load()
}

// --- Assessments ---
async function addAssessment() {
  await assessmentsApi.create(props.topicId, { title: t('content.test'), order: nextOrder() })
  await load()
  const created = items.value.filter((i) => i.contentType === 'ASSESSMENT').at(-1)
  if (created) expandedAssessmentId.value = created.id
}
function onAssessmentUpdated() {
  load()
}
function onAssessmentRemoved() {
  expandedAssessmentId.value = null
  load()
}

onMounted(load)
</script>

<template>
  <div class="mt-3 rounded-lg border border-border bg-surface-2 p-4">
    <p class="text-small font-semibold text-ink">{{ t('content.manage') }}</p>

    <p v-if="errorMessage" class="mt-2 text-small text-danger">{{ errorMessage }}</p>

    <ul v-if="items.length > 0" class="mt-2 divide-y divide-border">
      <li v-for="item in items" :key="`${item.contentType}-${item.id}`" class="py-3">
        <!-- VIDEO row -->
        <template v-if="item.contentType === 'VIDEO'">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                :class="(isVideoProcessing[item.processingStatus] ?? {}).variant === 'success' ? 'bg-success-subtle text-success' : (isVideoProcessing[item.processingStatus] ?? {}).variant === 'danger' ? 'bg-danger-subtle text-danger' : 'bg-surface text-ink-faint'"
              >
                <Icon :name="isVideoProcessing[item.processingStatus]?.icon ?? 'video'" size="15" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-small font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-caption text-ink-faint">
                  {{ formatSize(item.fileSize) }} · {{ t(`videos.processing.${item.processingStatus}`) }}
                </p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <Badge :variant="item.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
                {{ item.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
              </Badge>
              <AppButton variant="ghost" size="sm" @click="expandedReportVideoId = expandedReportVideoId === item.id ? null : item.id">
                {{ t('videoReport.title') }}
              </AppButton>
              <template v-if="canManage">
                <AppButton
                  :variant="item.hasQuiz ? 'outline' : 'ghost'"
                  size="sm"
                  icon="file-text"
                  @click="expandedQuizVideoId = expandedQuizVideoId === item.id ? null : item.id"
                >
                  {{ t('quiz.title') }}
                </AppButton>
                <AppButton variant="ghost" size="sm" @click="toggleVideoStatus(item)">
                  {{ item.status === 'PUBLISHED' ? t('videos.unpublish') : t('videos.publish') }}
                </AppButton>
                <AppButton variant="ghost" size="sm" icon="trash" @click="removeVideo(item)" />
              </template>
            </div>
          </div>

          <div v-if="canManage" class="mt-2 flex items-center gap-2 pl-11 text-caption text-ink-muted">
            <label class="flex items-center gap-1.5">
              <input
                type="checkbox"
                class="h-3.5 w-3.5 rounded border-border-strong text-primary"
                :checked="item.pointsEnabled"
                @change="item.pointsEnabled = $event.target.checked; saveVideoPoints(item)"
              />
              {{ t('quiz.pointsEnabled') }}
            </label>
            <input
              v-if="item.pointsEnabled"
              type="number"
              min="0"
              class="w-16 rounded border border-border-strong bg-surface px-1.5 py-0.5 text-caption text-ink outline-none"
              :value="item.points"
              :disabled="pointsSaving === item.id"
              @change="item.points = Number($event.target.value); saveVideoPoints(item)"
            />
          </div>

          <VideoQuizEditor
            v-if="expandedQuizVideoId === item.id"
            :video-id="item.id"
            :has-quiz="item.hasQuiz"
            @updated="(hasQuiz) => onQuizUpdated(item, hasQuiz)"
          />
          <VideoReportPanel v-if="expandedReportVideoId === item.id" :video-id="item.id" />
        </template>

        <!-- FILE / PRESENTATION / MULTIMEDIA row -->
        <template v-else-if="['FILE', 'PRESENTATION', 'MULTIMEDIA'].includes(item.contentType)">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-ink-faint">
                <Icon :name="ICON_BY_TYPE[item.contentType]" size="15" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-small font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-caption text-ink-faint">
                  {{ t(`content.${item.contentType.toLowerCase()}`) }} · {{ formatSize(item.fileSize) }}
                </p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <Badge :variant="item.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
                {{ item.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
              </Badge>
              <AppButton variant="ghost" size="sm" icon="eye" @click="openMaterial = item">
                {{ t('materials.open') }}
              </AppButton>
              <AppButton variant="ghost" size="sm" icon="download" @click="downloadMaterial(item)">
                {{ t('materials.download') }}
              </AppButton>
              <template v-if="canManage">
                <AppButton variant="ghost" size="sm" @click="toggleMaterialStatus(item)">
                  {{ item.status === 'PUBLISHED' ? t('materials.unpublish') : t('materials.publish') }}
                </AppButton>
                <AppButton variant="ghost" size="sm" icon="trash" @click="removeMaterial(item)" />
              </template>
            </div>
          </div>
        </template>

        <!-- ASSESSMENT row -->
        <template v-else-if="item.contentType === 'ASSESSMENT'">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-ink-faint">
                <Icon name="check-square" size="15" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-small font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-caption text-ink-faint">{{ item.questionCount }} · {{ t('assessment.title') }}</p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <Badge :variant="item.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
                {{ item.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
              </Badge>
              <AppButton
                v-if="canManage"
                variant="outline"
                size="sm"
                icon="check-square"
                @click="expandedAssessmentId = expandedAssessmentId === item.id ? null : item.id"
              >
                {{ t('assessment.title') }}
              </AppButton>
            </div>
          </div>

          <AssessmentEditor
            v-if="expandedAssessmentId === item.id"
            :assessment-id="item.id"
            @updated="onAssessmentUpdated"
            @removed="onAssessmentRemoved"
          />
        </template>
      </li>
    </ul>
    <p v-else-if="!loading" class="mt-2 text-small text-ink-faint">{{ t('materials.empty') }}</p>

    <div v-if="canUpload" class="mt-4 border-t border-border pt-4">
      <div class="flex flex-wrap gap-2">
        <AppButton
          v-for="type in ['VIDEO', 'FILE', 'PRESENTATION', 'MULTIMEDIA']"
          :key="type"
          size="sm"
          :variant="addingType === type ? 'outline' : 'ghost'"
          icon="plus"
          @click="addingType = addingType === type ? null : type"
        >
          {{ t(`content.${type.toLowerCase()}`) }}
        </AppButton>
        <AppButton v-if="canManage" size="sm" variant="ghost" icon="plus" @click="addAssessment">
          {{ t('content.test') }}
        </AppButton>
      </div>

      <!-- Video upload form -->
      <div
        v-if="addingType === 'VIDEO'"
        class="mt-3 rounded-lg border-2 border-dashed p-6 text-center text-small transition-default"
        :class="isDragOver ? 'border-primary bg-primary-subtle' : 'border-border-strong bg-surface'"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="onDrop"
      >
        <template v-if="!selectedVideoFile">
          <Icon name="upload" size="22" class="mx-auto text-ink-faint" />
          <p class="mt-2 text-ink-muted">
            {{ t('videos.dropHint') }}
            <label class="cursor-pointer font-medium text-primary hover:underline">
              {{ t('videos.browse') }}
              <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm" class="hidden" @change="onVideoFileInputChange" />
            </label>
          </p>
        </template>
        <div v-else class="space-y-3 text-left">
          <p class="text-small font-medium text-ink">{{ selectedVideoFile.name }} <span class="text-ink-faint">({{ formatSize(selectedVideoFile.size) }})</span></p>
          <AppInput v-model="videoForm.title" required :label="t('courses.fields.title')" />
          <label class="flex items-center gap-2 text-small text-ink">
            <input v-model="videoForm.required" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
            {{ t('videos.required') }}
          </label>

          <div v-if="upload.status.value === 'idle'" class="flex gap-2">
            <AppButton @click="startVideoUpload">{{ t('videos.startUpload') }}</AppButton>
            <AppButton variant="ghost" @click="cancelVideoAdd">{{ t('courses.cancel') }}</AppButton>
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

      <!-- Material upload form (FILE / PRESENTATION / MULTIMEDIA) -->
      <div v-else-if="['FILE', 'PRESENTATION', 'MULTIMEDIA'].includes(addingType)" class="mt-3">
        <MaterialUploadForm
          :topic-id="topicId"
          :content-type="addingType"
          :next-order="nextOrder()"
          @created="onMaterialCreated"
          @cancel="addingType = null"
        />
      </div>
    </div>

    <MaterialViewer :material="openMaterial" @close="openMaterial = null" />
  </div>
</template>
