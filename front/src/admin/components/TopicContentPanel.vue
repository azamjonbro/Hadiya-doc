<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import { topicsApi } from '@/services/topics'
import { videosApi } from '@/services/videos'
import { materialsApi } from '@/services/materials'
import { assessmentsApi } from '@/services/assessments'
import { lessonsApi } from '@/services/lessons'
import { scormApi } from '@/services/scorm'
import { useVideoUpload } from '@/composables/useVideoUpload'
import MaterialUploadForm from '@/admin/components/MaterialUploadForm.vue'
import MaterialViewer from '@/components/MaterialViewer.vue'
import AssessmentEditor from '@/admin/components/AssessmentEditor.vue'
import LessonEditor from '@/admin/components/LessonEditor.vue'
import SubtitleManager from '@/admin/components/SubtitleManager.vue'
import ScormUploadForm from '@/admin/components/ScormUploadForm.vue'
import VideoReportPanel from '@/admin/components/VideoReportPanel.vue'
import ProctorAlertsPanel from '@/admin/components/ProctorAlertsPanel.vue'
import VideoQuizEditor from '@/admin/components/VideoQuizEditor.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import FileDropzone from '@/components/ui/FileDropzone.vue'
import Icon from '@/components/ui/Icon.vue'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({ topicId: { type: String, required: true } })

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const confirm = useConfirm()
const toast = useToast()

/**
 * Runs an action and says so when it fails.
 *
 * Every one of these used to be a bare `await` with nothing around it. A
 * rejected request became an unhandled promise rejection: the console knew,
 * the console was not open, and from the outside the button simply did
 * nothing at all — no spinner, no message, no change. "The delete button
 * doesn't work" is what that looks like, and it looks identical whether the
 * cause was a permission, a validation error or a dropped connection.
 */
async function run(action, fallbackKey) {
  try {
    await action()
    return true
  } catch (error) {
    toast.error(apiErrorText(error, t(fallbackKey)))
    return false
  }
}
const canManage = computed(() => auth.hasPermission('video:manage'))
const canUpload = computed(() => auth.hasPermission('video:upload'))

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const expandedReportVideoId = ref(null)
// Caption tracks (9.4), opened per video like the quiz editor.
const expandedSubtitleVideoId = ref(null)
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
    errorMessage.value = apiErrorText(error)
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
function pickVideoFile(file) {
  if (!file) return
  selectedVideoFile.value = file
  if (!videoForm.title) videoForm.title = file.name.replace(/\.[^.]+$/, '')
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
  if (await run(() => videosApi.update(item.id, { status: nextStatus }), 'content.statusFailed')) load()
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
  if (await run(() => videosApi.remove(item.id), 'content.deleteFailed')) load()
}

// --- Materials ---
async function toggleMaterialStatus(item) {
  const nextStatus = item.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
  if (await run(() => materialsApi.update(item.id, { status: nextStatus }), 'content.statusFailed')) load()
}
/**
 * Whether learners get a download button for this file.
 *
 * Not DRM — the server refuses the attachment URL, which stops the button
 * and the shareable link, and stops nothing else. It makes "please don't
 * circulate this" enforced rather than a note in the description.
 */
async function toggleMaterialDownload(item) {
  if (await run(() => materialsApi.update(item.id, { allowDownload: item.allowDownload === false }), 'content.statusFailed')) {
    load()
  }
}
async function removeMaterial(item) {
  if (!(await confirm.ask({ message: t('confirm.deleteMaterial', { title: item.title }) }))) return
  if (await run(() => materialsApi.remove(item.id), 'content.deleteFailed')) load()
}
// Opening an upload in the same reader the learners get is how a manager
// checks a file before publishing it.
const openMaterial = ref(null)

async function downloadMaterial(item) {
  try {
    const { url } = await materialsApi.getDownloadUrl(item.id)
    window.open(url, '_blank', 'noopener')
  } catch (error) {
    toast.error(apiErrorText(error, t('content.downloadFailed')))
  }
}
function onMaterialCreated() {
  addingType.value = null
  load()
}

// --- Lessons (9.2) ---
const expandedLessonId = ref(null)

/**
 * Creates an empty draft and opens the editor on it.
 *
 * No dialog asking for a title first: a lesson is written in the editor, and
 * the title is the first field in it. The order is left to the server, which
 * counts the end of the topic across all four content types.
 */
async function addLesson() {
  let created = null
  if (!(await run(async () => {
    created = await lessonsApi.create(props.topicId, { title: t('content.lesson') })
  }, 'content.createFailed'))) {
    return
  }
  await load()
  if (created) expandedLessonId.value = created.id
}

function onLessonUpdated() {
  load()
}

function onLessonRemoved() {
  expandedLessonId.value = null
  load()
}

// --- SCORM (9.3) ---
//
// Extraction happens in the worker, so a package appears as PENDING and
// becomes READY a moment later. The panel polls while any package is still
// being prepared rather than making the author press refresh — and stops as
// soon as none is, so an idle content panel makes no requests.
let scormPoll = null

function scheduleScormPoll() {
  if (scormPoll) return
  const pending = items.value.some(
    (item) => item.contentType === 'SCORM' && ['PENDING', 'EXTRACTING'].includes(item.processingStatus)
  )
  if (!pending) return
  scormPoll = window.setTimeout(async () => {
    scormPoll = null
    await load()
    scheduleScormPoll()
  }, 4000)
}

function onScormCreated() {
  addingType.value = null
  load().then(scheduleScormPoll)
}

async function toggleScormStatus(item) {
  if (!(await run(() => scormApi.update(item.id, { status: item.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' }), 'content.statusFailed'))) {
    return
  }
  await load()
}

async function retryScorm(item) {
  if (!(await run(() => scormApi.reprocess(item.id), 'content.statusFailed'))) return
  await load()
  scheduleScormPoll()
}

async function removeScorm(item) {
  if (!(await confirm.ask({ message: t('scorm.confirmDelete', { title: item.title }) }))) return
  if (!(await run(() => scormApi.remove(item.id), 'content.deleteFailed'))) return
  await load()
}

// --- Assessments ---
async function addAssessment() {
  if (!(await run(() => assessmentsApi.create(props.topicId, { title: t('content.test'), order: nextOrder() }), 'content.createFailed'))) {
    return
  }
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

onMounted(async () => {
  await load()
  scheduleScormPoll()
})

onBeforeUnmount(() => {
  if (scormPoll) window.clearTimeout(scormPoll)
})
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
                  {{ formatSize(item.fileSize) }} · {{ t(`admin.videos.processing.${item.processingStatus}`) }}
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
                <AppButton
                  :variant="item.subtitles?.length ? 'outline' : 'ghost'"
                  size="sm"
                  icon="message-square"
                  @click="expandedSubtitleVideoId = expandedSubtitleVideoId === item.id ? null : item.id"
                >
                  {{ t('subtitles.short') }}<template v-if="item.subtitles?.length"> ({{ item.subtitles.length }})</template>
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
          <SubtitleManager
            v-if="expandedSubtitleVideoId === item.id"
            :video-id="item.id"
            @changed="load"
          />
          <VideoReportPanel v-if="expandedReportVideoId === item.id" :video-id="item.id" />
          <ProctorAlertsPanel v-if="expandedReportVideoId === item.id" class="mt-3" :video-id="item.id" />
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
                {{ t('admin.materials.open') }}
              </AppButton>
              <AppButton variant="ghost" size="sm" icon="download" @click="downloadMaterial(item)">
                {{ t('materials.download') }}
              </AppButton>
              <template v-if="canManage">
                <AppButton
                  variant="ghost"
                  size="sm"
                  :icon="item.allowDownload === false ? 'lock' : 'download'"
                  @click="toggleMaterialDownload(item)"
                >
                  {{ item.allowDownload === false ? t('materials.downloadBlocked') : t('materials.downloadAllowed') }}
                </AppButton>
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

        <!-- LESSON row (9.2) -->
        <template v-else-if="item.contentType === 'LESSON'">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-ink-faint">
                <Icon name="book-open" size="15" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-small font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-caption text-ink-faint">
                  {{ t('content.lesson') }} · {{ t('content.blockCount', { count: item.blockCount }) }}
                  <template v-if="item.estimatedMinutes">· {{ t('courses.minutes', { count: item.estimatedMinutes }) }}</template>
                </p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <Badge :variant="item.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
                {{ item.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
              </Badge>
              <AppButton
                v-if="canManage"
                :variant="expandedLessonId === item.id ? 'outline' : 'ghost'"
                size="sm"
                icon="pencil"
                @click="expandedLessonId = expandedLessonId === item.id ? null : item.id"
              >
                {{ t('lesson.blocks') }}
              </AppButton>
            </div>
          </div>

          <LessonEditor
            v-if="expandedLessonId === item.id"
            :lesson-id="item.id"
            :topic-id="topicId"
            @updated="onLessonUpdated"
            @removed="onLessonRemoved"
          />
        </template>

        <!-- SCORM row (9.3) -->
        <template v-else-if="item.contentType === 'SCORM'">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-ink-faint">
                <Icon name="globe" size="15" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-small font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-caption text-ink-faint">
                  SCORM {{ item.version }}
                  <template v-if="item.fileCount">· {{ t('scorm.fileCount', { count: item.fileCount }) }}</template>
                  <template v-if="item.totalBytes">· {{ formatSize(item.totalBytes) }}</template>
                  <template v-if="item.masteryScore">· {{ t('scorm.mastery', { score: item.masteryScore }) }}</template>
                </p>
                <!-- The reason a failed package failed, where the author is
                     looking, rather than in a log they cannot read. -->
                <p v-if="item.processingStatus === 'FAILED'" class="truncate text-caption text-danger">
                  {{ item.processingError || t('scorm.failedToPrepare') }}
                </p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <Badge v-if="item.processingStatus === 'READY'" :variant="item.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
                {{ item.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
              </Badge>
              <Badge v-else-if="item.processingStatus === 'FAILED'" variant="danger" size="sm">{{ t('scorm.statusFailed') }}</Badge>
              <Badge v-else variant="warning" size="sm">{{ t('scorm.statusPreparing') }}</Badge>

              <AppButton
                v-if="item.processingStatus === 'READY'"
                variant="ghost"
                size="sm"
                icon="eye"
                @click="router.push(`/scorm/${item.id}`)"
              >
                {{ t('scorm.open') }}
              </AppButton>
              <template v-if="canManage">
                <AppButton
                  v-if="item.processingStatus === 'FAILED'"
                  variant="ghost"
                  size="sm"
                  icon="refresh"
                  @click="retryScorm(item)"
                >
                  {{ t('scorm.retry') }}
                </AppButton>
                <AppButton
                  v-if="item.processingStatus === 'READY'"
                  variant="ghost"
                  size="sm"
                  @click="toggleScormStatus(item)"
                >
                  {{ item.status === 'PUBLISHED' ? t('materials.unpublish') : t('materials.publish') }}
                </AppButton>
                <AppButton variant="ghost" size="sm" icon="trash" @click="removeScorm(item)" />
              </template>
            </div>
          </div>
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
        <AppButton v-if="canManage" size="sm" variant="ghost" icon="plus" @click="addLesson">
          {{ t('content.lesson') }}
        </AppButton>
        <AppButton
          v-if="canManage"
          size="sm"
          :variant="addingType === 'SCORM' ? 'outline' : 'ghost'"
          icon="plus"
          @click="addingType = addingType === 'SCORM' ? null : 'SCORM'"
        >
          SCORM
        </AppButton>
      </div>

      <!-- Video upload form. The dropzone is only the empty state: once a
           file is picked the same box holds a title field and buttons, and a
           <button> cannot contain those. -->
      <FileDropzone
        v-if="addingType === 'VIDEO' && !selectedVideoFile"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
        class="mt-3"
        :title="t('videos.dropHint')"
        :hint="t('videos.browse')"
        @select="pickVideoFile"
      />

      <div
        v-else-if="addingType === 'VIDEO'"
        class="mt-3 rounded-lg border border-border-strong bg-surface p-6 text-small"
      >
        <div class="space-y-3 text-left">
          <p class="text-small font-medium text-ink">{{ selectedVideoFile.name }} <span class="text-ink-faint">({{ formatSize(selectedVideoFile.size) }})</span></p>
          <AppInput v-model="videoForm.title" required :label="t('admin.courses.fields.title')" />
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

      <ScormUploadForm
        v-if="addingType === 'SCORM'"
        :topic-id="topicId"
        @created="onScormCreated"
        @cancel="addingType = null"
      />

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
