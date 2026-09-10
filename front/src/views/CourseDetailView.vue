<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { videosApi } from '@/services/videos'
import { assessmentsApi } from '@/services/assessments'
import { materialsApi } from '@/services/materials'
// AI o'quv yordamchisi vaqtincha o'chirilgan — pastdagi shablonga qarang.
// import AiChatPanel from '@/components/AiChatPanel.vue'
import MaterialViewer from '@/components/MaterialViewer.vue'
import ReviewsPanel from '@/components/ReviewsPanel.vue'
import QAPanel from '@/components/QAPanel.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Tabs from '@/components/ui/Tabs.vue'
import { apiErrorText } from '@/utils/apiError'
import { loadPdfjs } from '@/utils/pdfjs'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const course = ref(null)
const topics = ref([])
const videosByTopic = ref({})
// A module's closing test lives alongside its videos in the curriculum —
// it is part of the module, not a separate thing to hunt for.
const assessmentsByTopic = ref({})
// Slides, documents and audio attached to the module. They open in a reader
// inside the app rather than as a download.
const materialsByTopic = ref({})
const openMaterial = ref(null)
const openTopics = ref(new Set())
const progress = ref(null)

// Refetched rather than patched locally after a page is read: the server owns
// what a page is worth, and a bar that disagrees with the next page load is
// worse than one that redraws.
async function loadProgress() {
  try {
    progress.value = await coursesApi.getMyProgress(route.params.id)
  } catch {
    // Keep the last figure on screen rather than blanking the bar.
  }
}
const activeTab = ref('content')
const tabs = [
  { value: 'content', label: t('courses.curriculum') },
  { value: 'reviews', label: t('reviews.title') },
  { value: 'qa', label: t('qa.title') },
]

function formatDuration(seconds) {
  if (!seconds) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function toggleTopic(id) {
  const next = new Set(openTopics.value)
  next.has(id) ? next.delete(id) : next.add(id)
  openTopics.value = next
}

function videoIcon(video) {
  if (video.processingStatus !== 'READY') return 'lock'
  // Lock state comes from the server alongside progress — the same answer
  // the playback endpoint would give.
  if (videoProgress(video).locked) return 'lock'
  if (videoProgress(video).completed) return 'check'
  return 'play'
}

function isVideoOpen(video) {
  return video.processingStatus === 'READY' && !videoProgress(video).locked
}

const totalVideos = () => Object.values(videosByTopic.value).reduce((sum, list) => sum + (list?.length ?? 0), 0)

// Videos, materials and the module test — the collapsed row's number should
// match what actually appears when it is expanded.
function topicItemCount(topicId) {
  return (
    (videosByTopic.value[topicId]?.length ?? 0) +
    (materialsByTopic.value[topicId]?.length ?? 0) +
    (assessmentsByTopic.value[topicId]?.length ?? 0)
  )
}

const MATERIAL_ICONS = {
  'application/pdf': 'file-text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'grid',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'layers',
}

function materialIcon(material) {
  if (material.mimeType?.startsWith('audio/')) return 'mic'
  return MATERIAL_ICONS[material.mimeType] ?? 'file-text'
}

function videoProgress(video) {
  return progress.value?.videos?.[video.id] ?? { completionPercent: 0, completed: false }
}

// The same answer for the other two kinds of content, so a row can say where
// the reader got to rather than looking identical whether it was opened or
// not. Both come from the course progress payload — nothing here is inferred
// client-side.
function materialProgress(material) {
  return (
    progress.value?.materials?.[material.id] ?? {
      completionPercent: 0,
      viewedPages: 0,
      totalPages: 0,
      completed: false,
    }
  )
}

function assessmentProgress(assessment) {
  return progress.value?.assessments?.[assessment.id] ?? { completed: false }
}

// pdf.js weighs more than most of the documents it opens, so the download
// starts while the pointer is still on the row rather than after the click.
function onMaterialHover(material) {
  if (material.mimeType === 'application/pdf') loadPdfjs()
}


function continueVideo() {
  for (const topic of topics.value) {
    for (const video of videosByTopic.value[topic.id] ?? []) {
      if (video.processingStatus === 'READY' && !videoProgress(video).completed) return video
    }
  }
  return Object.values(videosByTopic.value).flat()[0] ?? null
}

function onContinue() {
  const video = continueVideo()
  if (video) router.push(`/videos/${video.id}`)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    course.value = await coursesApi.getById(route.params.id)
    topics.value = await coursesApi.listTopics(route.params.id)
    const [videoLists, materialLists, assessmentLists] = await Promise.all([
      Promise.all(topics.value.map((topic) => videosApi.listByTopic(topic.id))),
      // A module without materials is normal, so a failure here degrades to
      // "no materials shown" rather than breaking the whole curriculum — same
      // reasoning as the tests below.
      Promise.all(topics.value.map((topic) => materialsApi.listByTopic(topic.id).catch(() => []))),
      Promise.all(topics.value.map((topic) => assessmentsApi.listByTopic(topic.id).catch(() => []))),
    ])
    videosByTopic.value = Object.fromEntries(topics.value.map((topic, i) => [topic.id, videoLists[i]]))
    materialsByTopic.value = Object.fromEntries(topics.value.map((topic, i) => [topic.id, materialLists[i]]))
    assessmentsByTopic.value = Object.fromEntries(topics.value.map((topic, i) => [topic.id, assessmentLists[i]]))
    openTopics.value = new Set(topics.value.slice(0, 1).map((tp) => tp.id))
    await loadProgress()
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/courses')">
      <Icon name="chevron-left" size="16" />
      {{ t('courses.title') }}
    </button>

    <template v-if="loading">
      <Skeleton class="mt-5 h-44 w-full" />
      <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="space-y-3 lg:col-span-2">
          <Skeleton v-for="i in 4" :key="i" class="h-14 w-full" />
        </div>
        <Skeleton class="h-64 w-full" />
      </div>
    </template>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="course">
      <!-- Clean Flat Header -->
      <div class="mt-4 flex flex-col md:flex-row items-start gap-8 bg-surface p-6 sm:p-8 rounded-md border border-border shadow-sm">
        <div
          class="flex h-48 w-full md:w-72 shrink-0 items-center justify-center bg-surface-2 text-ink-faint rounded"
          :style="course.cover ? `background-image:url(${course.cover});background-size:cover;background-position:center` : ''"
        >
          <Icon v-if="!course.cover" name="book-open" size="48" />
        </div>
        
        <div class="flex-1 min-w-0 flex flex-col h-full">
          <div>
            <div class="flex items-center gap-2 mb-3">
              <Badge variant="primary">{{ t('courses.title') }}</Badge>
            </div>
            <h1 class="text-h1 text-ink leading-tight">{{ course.title }}</h1>
            <p v-if="course.description" class="mt-3 text-body text-ink-muted leading-relaxed">{{ course.description }}</p>
            <div class="mt-5 flex items-center gap-6 text-small text-ink-muted">
              <span class="flex items-center gap-1.5"><Icon name="layers" size="16" />{{ topics.length }} {{ t('courses.modules') }}</span>
              <span class="flex items-center gap-1.5"><Icon name="video" size="16" />{{ totalVideos() }} {{ t('courses.videos') }}</span>
            </div>
          </div>
          
          <div class="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-6 border-t border-border pt-6">
            <div class="flex-1 w-full max-w-sm">
              <div class="flex items-center justify-between text-small font-medium text-ink mb-2">
                <span>{{ t('dashboard.progress.title') }}</span>
                <span>{{ progress?.completionPercent ?? 0 }}%</span>
              </div>
              <ProgressBar :value="progress?.completionPercent ?? 0" size="md" />
              <p class="mt-2 text-caption text-ink-faint">
                {{ progress?.completionPercent ?? 0 }}% {{ t('videos.completed') }}
                <span v-if="progress">({{ progress.completedItems }}/{{ progress.totalItems }})</span>
              </p>
            </div>
            <AppButton size="lg" icon="play" icon-position="left" class="shrink-0" :disabled="!continueVideo()" @click="onContinue">{{ t('courses.continue') }}</AppButton>
          </div>
        </div>
      </div>

      <div class="mt-8 border-b border-border">
        <Tabs v-model="activeTab" :tabs="tabs" class="-mb-px" />
      </div>

      <div class="mt-6">
        <!-- Curriculum -->
        <div v-if="activeTab === 'content'" class="max-w-4xl">
          <div class="space-y-4">
            <AppCard v-for="topic in topics" :key="topic.id" padding="none" class="overflow-hidden border border-border shadow-sm">
              <button type="button" class="flex w-full items-center justify-between px-5 py-4 text-left transition-default hover:bg-surface-2" @click="toggleTopic(topic.id)">
                <div>
                  <p class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('courses.topics.title') }} {{ topic.order }}</p>
                  <p class="mt-1 text-small font-semibold text-ink">{{ topic.title }}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-caption font-medium text-ink-faint">{{ topicItemCount(topic.id) }} items</span>
                  <Icon :name="openTopics.has(topic.id) ? 'chevron-up' : 'chevron-down'" size="16" class="text-ink-muted" />
                </div>
              </button>
              <div v-if="openTopics.has(topic.id)" class="divide-y divide-border border-t border-border bg-surface">
                <template v-for="video in videosByTopic[topic.id]" :key="video.id">
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-5 py-3 text-left transition-default hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    :disabled="!isVideoOpen(video)"
                    :title="videoProgress(video).locked ? t('videos.lockedHint') : ''"
                    @click="router.push(`/videos/${video.id}`)"
                  >
                    <span
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                      :class="videoProgress(video).completed ? 'bg-success/10 text-success' : 'bg-surface-2 text-ink-muted'"
                    >
                      <Icon :name="videoIcon(video)" size="14" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-small font-medium text-ink">{{ video.title }}</span>
                    <span
                      v-if="!videoProgress(video).completed && videoProgress(video).completionPercent > 0"
                      class="shrink-0 text-caption font-semibold text-primary"
                    >
                      {{ videoProgress(video).completionPercent }}%
                    </span>
                    <span v-if="video.duration" class="shrink-0 text-caption text-ink-muted">{{ formatDuration(video.duration) }}</span>
                  </button>

                  <!-- The lesson's own quiz, on its own page, opened only
                       once the lesson has been watched through. -->
                  <button
                    v-if="video.hasQuiz"
                    type="button"
                    class="flex w-full items-center gap-3 py-3 pl-14 pr-5 text-left transition-default hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    :disabled="!videoProgress(video).completed"
                    :title="videoProgress(video).completed ? '' : t('quiz.watchFirstHint')"
                    @click="router.push(`/videos/${video.id}/quiz`)"
                  >
                    <Icon
                      :name="videoProgress(video).completed ? 'file-text' : 'lock'"
                      size="14"
                      class="shrink-0 text-ink-muted"
                    />
                    <span class="min-w-0 flex-1 truncate text-small font-medium text-ink-muted">{{ t('quiz.title') }}</span>
                  </button>
                </template>

                <!-- Slides, documents and audio: opened in the in-app reader -->
                <button
                  v-for="material in materialsByTopic[topic.id]"
                  :key="material.id"
                  type="button"
                  class="flex w-full items-center gap-3 px-5 py-3 text-left transition-default hover:bg-surface-2"
                  @click="openMaterial = material"
                  @mouseenter="onMaterialHover(material)"
                >
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                    :class="materialProgress(material).completed ? 'bg-success/10 text-success' : 'bg-surface-2 text-ink-muted'"
                  >
                    <Icon :name="materialIcon(material)" size="14" />
                  </span>
                  <span class="min-w-0 flex-1 truncate text-small font-medium text-ink">{{ material.title }}</span>

                  <!-- Read all of it, part of it, or none: the row says which. -->
                  <Icon
                    v-if="materialProgress(material).completed"
                    name="check-circle"
                    size="16"
                    class="shrink-0 text-success"
                  />
                  <span
                    v-else-if="materialProgress(material).totalPages"
                    class="shrink-0 text-caption tabular-nums text-ink-muted"
                  >
                    {{ materialProgress(material).viewedPages }}/{{ materialProgress(material).totalPages }} ·
                    {{ materialProgress(material).completionPercent }}%
                  </span>
                  <Icon v-else name="eye" size="14" class="shrink-0 text-ink-muted" />
                </button>

                <!-- The module's closing test, listed after its videos -->
                <button
                  v-for="assessment in assessmentsByTopic[topic.id]"
                  :key="assessment.id"
                  type="button"
                  class="flex w-full items-center gap-3 px-5 py-3 text-left transition-default hover:bg-surface-2"
                  @click="router.push(`/assessments/${assessment.id}`)"
                >
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                    :class="assessmentProgress(assessment).completed ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'"
                  >
                    <Icon name="check-square" size="14" />
                  </span>
                  <span class="min-w-0 flex-1 truncate text-small font-medium text-ink">{{ assessment.title }}</span>
                  <span
                    v-if="assessmentProgress(assessment).completed"
                    class="flex shrink-0 items-center gap-1.5 text-caption font-semibold text-success"
                  >
                    <Icon name="check-circle" size="14" />
                    {{ t('assessment.passed') }}
                  </span>
                  <span v-else class="shrink-0 text-caption text-ink-muted">
                    {{ t('assessment.questionCount', { count: assessment.questionCount ?? assessment.questions?.length ?? 0 }) }}
                  </span>
                </button>

                <p
                  v-if="!videosByTopic[topic.id]?.length && !materialsByTopic[topic.id]?.length && !assessmentsByTopic[topic.id]?.length"
                  class="px-5 py-6 text-center text-small text-ink-faint"
                >
                  {{ t('videos.empty') }}
                </p>
              </div>
            </AppCard>

            <EmptyState v-if="topics.length === 0" icon="layers" :title="t('courses.topics.empty')" />
          </div>
        </div>

        <div v-else-if="activeTab === 'reviews'" class="max-w-4xl">
          <ReviewsPanel :course-id="course.id" />
        </div>

        <div v-else-if="activeTab === 'qa'" class="max-w-4xl">
          <QAPanel :course-id="course.id" />
        </div>
      </div>
    </template>

    <!-- Reading a document moves the bar: the viewer reports each page it
         shows, so the panel is refreshed from the server rather than guessing
         what that page was worth. -->
    <MaterialViewer :material="openMaterial" @close="openMaterial = null" @progress="loadProgress" />
  </div>
</template>
