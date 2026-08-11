<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { videosApi } from '@/services/videos'
import VideoPlayer from '@/video/VideoPlayer.vue'
import AiChatPanel from '@/components/AiChatPanel.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const video = ref(null)
const course = ref(null)
const topics = ref([])
const videosByTopic = ref({})
const openTopics = ref(new Set())
const watched = ref(0)
const duration = ref(0)

function toggleTopic(id) {
  const next = new Set(openTopics.value)
  next.has(id) ? next.delete(id) : next.add(id)
  openTopics.value = next
}

function formatDuration(seconds) {
  if (!seconds) return ''
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

const flatList = computed(() =>
  topics.value.flatMap((topic) => (videosByTopic.value[topic.id] ?? []).map((v) => ({ ...v, topicId: topic.id }))),
)

const currentIndex = computed(() => flatList.value.findIndex((v) => v.id === video.value?.id))
const nextVideo = computed(() => (currentIndex.value >= 0 ? flatList.value[currentIndex.value + 1] : null))

const watchPercent = computed(() => (duration.value ? Math.min(100, Math.round((watched.value / duration.value) * 100)) : 0))

function onTimeupdate({ currentTime, duration: dur }) {
  watched.value = currentTime
  duration.value = dur
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    video.value = await videosApi.getById(route.params.id)
    course.value = await coursesApi.getById(video.value.courseId)
    topics.value = await coursesApi.listTopics(video.value.courseId)
    const videoLists = await Promise.all(topics.value.map((topic) => videosApi.listByTopic(topic.id)))
    videosByTopic.value = Object.fromEntries(topics.value.map((topic, i) => [topic.id, videoLists[i]]))
    openTopics.value = new Set([video.value.topicId])
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

function goToVideo(id) {
  router.push(`/videos/${id}`)
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-6">
    <button
      type="button"
      class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink"
      @click="course ? router.push(`/courses/${course.id}`) : router.back()"
    >
      <Icon name="chevron-left" size="16" />
      {{ course?.title ?? t('courses.title') }}
    </button>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div class="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Player + info -->
      <div class="lg:col-span-2">
        <Skeleton v-if="loading" class="aspect-video w-full" />
        <template v-else-if="video">
          <VideoPlayer v-if="video.processingStatus === 'READY'" :key="video.id" :video-id="video.id" @timeupdate="onTimeupdate" />
          <div v-else class="flex aspect-video items-center justify-center rounded-lg border border-border bg-surface-2">
            <div class="text-center">
              <Icon name="video" size="26" class="mx-auto text-ink-faint" />
              <p class="mt-2 text-small text-ink-muted">{{ t(`videos.processing.${video.processingStatus}`) }}</p>
            </div>
          </div>

          <div class="mt-5">
            <h1 class="text-h2 text-ink">{{ video.title }}</h1>
            <p v-if="video.description" class="mt-2 text-body text-ink-muted">{{ video.description }}</p>

            <div class="mt-4">
              <div class="mb-1.5 flex items-center justify-between text-small text-ink-muted">
                <span>{{ watchPercent }}% {{ t('videos.completed') }}</span>
                <span v-if="duration">{{ formatDuration(watched) }} / {{ formatDuration(duration) }}</span>
              </div>
              <ProgressBar :value="watchPercent" />
            </div>

            <AppCard v-if="nextVideo" class="mt-6 flex items-center justify-between">
              <div class="min-w-0">
                <p class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('videos.next') }}</p>
                <p class="mt-0.5 truncate text-small font-medium text-ink">{{ nextVideo.title }}</p>
              </div>
              <AppButton icon="arrow-right" icon-position="right" @click="goToVideo(nextVideo.id)">{{ t('videos.next') }}</AppButton>
            </AppCard>

            <div class="mt-6">
              <AiChatPanel :course-id="video.courseId" :topic-id="video.topicId" :video-id="video.id" />
            </div>
          </div>
        </template>
      </div>

      <!-- Curriculum sidebar -->
      <div>
        <h2 class="mb-3 text-h3 text-ink">{{ t('courses.curriculum') }}</h2>
        <div v-if="loading" class="space-y-3">
          <Skeleton v-for="i in 4" :key="i" class="h-14 w-full" />
        </div>
        <div v-else class="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <AppCard v-for="topic in topics" :key="topic.id" padding="none" class="overflow-hidden">
            <button type="button" class="flex w-full items-center justify-between px-4 py-3 text-left transition-default hover:bg-surface-2" @click="toggleTopic(topic.id)">
              <div class="min-w-0">
                <p class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('courses.topics.title') }} {{ topic.order }}</p>
                <p class="mt-0.5 truncate text-small font-semibold text-ink">{{ topic.title }}</p>
              </div>
              <Icon :name="openTopics.has(topic.id) ? 'chevron-up' : 'chevron-down'" size="15" class="shrink-0 text-ink-faint" />
            </button>
            <div v-if="openTopics.has(topic.id)" class="divide-y divide-border border-t border-border">
              <button
                v-for="v in videosByTopic[topic.id]"
                :key="v.id"
                type="button"
                class="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-default hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                :class="v.id === video?.id ? 'bg-primary-subtle' : ''"
                :disabled="v.processingStatus !== 'READY'"
                @click="goToVideo(v.id)"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  :class="v.id === video?.id ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-ink-muted'"
                >
                  <Icon :name="v.processingStatus !== 'READY' ? 'lock' : v.id === video?.id ? 'play' : 'check'" size="11" />
                </span>
                <span class="min-w-0 flex-1 truncate text-caption" :class="v.id === video?.id ? 'font-medium text-ink' : 'text-ink-muted'">{{ v.title }}</span>
                <span v-if="v.duration" class="shrink-0 text-caption text-ink-faint">{{ formatDuration(v.duration) }}</span>
              </button>
            </div>
          </AppCard>
        </div>
      </div>
    </div>
  </div>
</template>
