<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { videosApi } from '@/services/videos'
import { quizzesApi } from '@/services/quizzes'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'

const props = defineProps({
  courseId: { type: String, required: true },
  userId: { type: String, required: true },
})

const { t } = useI18n()

const loading = ref(true)
const videos = ref([]) // flattened, in topic/order order
const progress = ref(null)
const expandedQuizVideoId = ref(null)
const quizResultsByVideoId = reactive({})
const quizLoading = ref(null)

async function load() {
  loading.value = true
  try {
    const [topics, progressResult] = await Promise.all([
      coursesApi.listTopics(props.courseId),
      coursesApi.getUserProgress(props.courseId, props.userId),
    ])
    const videoLists = await Promise.all(topics.map((topic) => videosApi.listByTopic(topic.id)))
    videos.value = videoLists.flat()
    progress.value = progressResult
  } finally {
    loading.value = false
  }
}

function videoProgress(video) {
  return progress.value?.videos?.[video.id] ?? { completionPercent: 0, completed: false }
}

async function toggleQuizResults(video) {
  if (expandedQuizVideoId.value === video.id) {
    expandedQuizVideoId.value = null
    return
  }
  expandedQuizVideoId.value = video.id
  if (!quizResultsByVideoId[video.id]) {
    quizLoading.value = video.id
    try {
      quizResultsByVideoId[video.id] = await quizzesApi.getAttemptsForUser(video.id, props.userId)
    } finally {
      quizLoading.value = null
    }
  }
}

onMounted(load)
</script>

<template>
  <div class="px-5 pb-4">
    <div v-if="loading" class="space-y-2 pt-3">
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-full" />
    </div>
    <template v-else>
      <div v-if="progress" class="flex items-center gap-3 pt-3">
        <div class="flex-1"><ProgressBar :value="progress.completionPercent" size="sm" /></div>
        <span class="shrink-0 text-caption font-medium text-ink-muted">
          {{ progress.completionPercent }}% ({{ progress.completedItems }}/{{ progress.totalItems }})
        </span>
      </div>

      <ul class="mt-3 divide-y divide-border rounded-md border border-border">
        <li v-for="video in videos" :key="video.id" class="px-3 py-2.5">
          <div class="flex items-center gap-2.5">
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              :class="videoProgress(video).completed ? 'bg-success-subtle text-success' : 'bg-surface-2 text-ink-faint'"
            >
              <Icon :name="videoProgress(video).completed ? 'check' : 'play'" size="12" />
            </span>
            <span class="min-w-0 flex-1 truncate text-small text-ink">{{ video.title }}</span>
            <span class="shrink-0 text-caption text-ink-faint">{{ videoProgress(video).completionPercent }}%</span>
            <AppButton
              v-if="video.hasQuiz"
              variant="ghost"
              size="sm"
              icon="file-text"
              @click="toggleQuizResults(video)"
            >
              {{ t('employeeProgress.quizResults') }}
            </AppButton>
          </div>

          <div v-if="expandedQuizVideoId === video.id" class="mt-2.5 rounded-md bg-surface-2 p-3">
            <Skeleton v-if="quizLoading === video.id" class="h-16 w-full" />
            <template v-else-if="quizResultsByVideoId[video.id]">
              <p v-if="!quizResultsByVideoId[video.id].attempts.length" class="text-small text-ink-faint">
                {{ t('employeeProgress.noAttempts') }}
              </p>
              <div v-for="attempt in quizResultsByVideoId[video.id].attempts" :key="attempt.id" class="mb-3 last:mb-0">
                <div class="flex items-center gap-2">
                  <Badge :variant="attempt.passed ? 'success' : 'danger'" size="sm">
                    {{ attempt.scorePercent }}% — {{ attempt.passed ? t('employeeProgress.passed') : t('employeeProgress.failed') }}
                  </Badge>
                  <span class="text-caption text-ink-faint">{{ new Date(attempt.createdAt).toLocaleString() }}</span>
                </div>
                <ul class="mt-2 space-y-1.5">
                  <li v-for="answer in attempt.answers" :key="answer.questionId" class="text-caption">
                    <div class="flex items-start gap-1.5">
                      <Icon
                        :name="answer.isCorrect ? 'check-circle' : 'alert-circle'"
                        size="13"
                        class="mt-0.5 shrink-0"
                        :class="answer.isCorrect ? 'text-success' : 'text-danger'"
                      />
                      <div>
                        <p class="text-ink">{{ answer.questionText }}</p>
                        <p class="text-ink-faint">
                          {{ t('employeeProgress.answered') }}: {{ answer.selectedOptionText }}
                          <template v-if="!answer.isCorrect">
                            · {{ t('employeeProgress.correctAnswer') }}: {{ answer.correctOptionText }}
                          </template>
                        </p>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </template>
          </div>
        </li>
        <li v-if="!videos.length" class="px-3 py-4 text-center text-small text-ink-faint">{{ t('videos.empty') }}</li>
      </ul>
    </template>
  </div>
</template>
