<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { videosApi } from '@/services/videos'
import { assessmentsApi } from '@/services/assessments'
import { materialsApi } from '@/services/materials'
import AiChatPanel from '@/components/AiChatPanel.vue'
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
    progress.value = await coursesApi.getMyProgress(route.params.id)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
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
      <!-- Hero -->
      <div
        class="relative mt-5 overflow-hidden rounded-xl bg-ink"
        :style="course.cover ? `background-image:url(${course.cover});background-size:cover;background-position:center` : ''"
      >
        <div class="bg-gradient-to-t from-black/70 via-black/30 to-transparent px-7 py-10">
          <div class="flex items-center gap-2">
            <Badge variant="primary" dot>{{ t('courses.title') }}</Badge>
          </div>
          <h1 class="mt-2.5 max-w-2xl text-display text-white">{{ course.title }}</h1>
          <p v-if="course.description" class="mt-3 max-w-2xl text-body text-white/70">{{ course.description }}</p>
          <div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-small text-white/80">
            <span class="flex items-center gap-1.5"><Icon name="layers" size="15" />{{ topics.length }} {{ t('courses.modules') }}</span>
            <span class="flex items-center gap-1.5"><Icon name="video" size="15" />{{ totalVideos() }} {{ t('courses.videos') }}</span>
          </div>
        </div>
      </div>

      <Tabs v-model="activeTab" :tabs="tabs" class="mt-8" />

      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Curriculum -->
        <div v-if="activeTab === 'content'" class="lg:col-span-2">
          <h2 class="mb-3 text-h3 text-ink">{{ t('courses.curriculum') }}</h2>
          <div class="space-y-3">
            <AppCard v-for="topic in topics" :key="topic.id" padding="none" class="overflow-hidden">
              <button type="button" class="flex w-full items-center justify-between px-4 py-3.5 text-left transition-default hover:bg-surface-2" @click="toggleTopic(topic.id)">
                <div>
                  <p class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('courses.topics.title') }} {{ topic.order }}</p>
                  <p class="mt-0.5 text-small font-semibold text-ink">{{ topic.title }}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-caption text-ink-faint">{{ topicItemCount(topic.id) }}</span>
                  <Icon :name="openTopics.has(topic.id) ? 'chevron-up' : 'chevron-down'" size="16" class="text-ink-faint" />
                </div>
              </button>
              <div v-if="openTopics.has(topic.id)" class="divide-y divide-border border-t border-border">
                <template v-for="video in videosByTopic[topic.id]" :key="video.id">
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-4 py-3 text-left transition-default hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    :disabled="!isVideoOpen(video)"
                    :title="videoProgress(video).locked ? t('videos.lockedHint') : ''"
                    @click="router.push(`/videos/${video.id}`)"
                  >
                    <span
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      :class="videoProgress(video).completed ? 'bg-success-subtle text-success' : 'bg-surface-2 text-ink-muted'"
                    >
                      <Icon :name="videoIcon(video)" size="13" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-small text-ink">{{ video.title }}</span>
                    <span
                      v-if="!videoProgress(video).completed && videoProgress(video).completionPercent > 0"
                      class="shrink-0 text-caption font-medium text-primary"
                    >
                      {{ videoProgress(video).completionPercent }}%
                    </span>
                    <span v-if="video.duration" class="shrink-0 text-caption text-ink-faint">{{ formatDuration(video.duration) }}</span>
                  </button>

                  <!-- The lesson's own quiz, on its own page, opened only
                       once the lesson has been watched through. -->
                  <button
                    v-if="video.hasQuiz"
                    type="button"
                    class="flex w-full items-center gap-3 py-2.5 pl-12 pr-4 text-left transition-default hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    :disabled="!videoProgress(video).completed"
                    :title="videoProgress(video).completed ? '' : t('quiz.watchFirstHint')"
                    @click="router.push(`/videos/${video.id}/quiz`)"
                  >
                    <Icon
                      :name="videoProgress(video).completed ? 'file-text' : 'lock'"
                      size="13"
                      class="shrink-0 text-ink-faint"
                    />
                    <span class="min-w-0 flex-1 truncate text-caption text-ink-muted">{{ t('quiz.title') }}</span>
                  </button>
                </template>

                <!-- Slides, documents and audio: opened in the in-app reader -->
                <button
                  v-for="material in materialsByTopic[topic.id]"
                  :key="material.id"
                  type="button"
                  class="flex w-full items-center gap-3 px-4 py-3 text-left transition-default hover:bg-surface-2"
                  @click="openMaterial = material"
                >
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                    <Icon :name="materialIcon(material)" size="13" />
                  </span>
                  <span class="min-w-0 flex-1 truncate text-small text-ink">{{ material.title }}</span>
                  <Icon name="eye" size="13" class="shrink-0 text-ink-faint" />
                </button>

                <!-- The module's closing test, listed after its videos -->
                <button
                  v-for="assessment in assessmentsByTopic[topic.id]"
                  :key="assessment.id"
                  type="button"
                  class="flex w-full items-center gap-3 px-4 py-3 text-left transition-default hover:bg-surface-2"
                  @click="router.push(`/assessments/${assessment.id}`)"
                >
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                    <Icon name="check-square" size="13" />
                  </span>
                  <span class="min-w-0 flex-1 truncate text-small font-medium text-ink">{{ assessment.title }}</span>
                  <span class="shrink-0 text-caption text-ink-faint">
                    {{ t('assessment.questionCount', { count: assessment.questionCount ?? assessment.questions?.length ?? 0 }) }}
                  </span>
                </button>

                <p
                  v-if="!videosByTopic[topic.id]?.length && !materialsByTopic[topic.id]?.length && !assessmentsByTopic[topic.id]?.length"
                  class="px-4 py-4 text-center text-small text-ink-faint"
                >
                  {{ t('videos.empty') }}
                </p>
              </div>
            </AppCard>

            <EmptyState v-if="topics.length === 0" icon="layers" :title="t('courses.topics.empty')" />
          </div>
        </div>

        <div v-else-if="activeTab === 'reviews'" class="lg:col-span-2">
          <ReviewsPanel :course-id="course.id" />
        </div>

        <div v-else-if="activeTab === 'qa'" class="lg:col-span-2">
          <QAPanel :course-id="course.id" />
        </div>

        <!-- Sidebar -->
        <div class="space-y-5">
          <AppCard>
            <p class="text-small font-semibold text-ink">{{ t('dashboard.progress.title') }}</p>
            <ProgressBar class="mt-3" :value="progress?.completionPercent ?? 0" />
            <p class="mt-2 text-caption text-ink-faint">
              {{ progress?.completionPercent ?? 0 }}% {{ t('videos.completed') }}
              <span v-if="progress">({{ progress.completedVideos }}/{{ progress.totalVideos }})</span>
            </p>
            <AppButton block class="mt-4" :disabled="!continueVideo()" @click="onContinue">{{ t('courses.continue') }}</AppButton>
          </AppCard>

          <AiChatPanel :course-id="course.id" />
        </div>
      </div>
    </template>

    <MaterialViewer :material="openMaterial" @close="openMaterial = null" />
  </div>
</template>
