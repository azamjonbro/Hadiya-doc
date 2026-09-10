<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { quizzesApi } from '@/services/quizzes'
import { videosApi } from '@/services/videos'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

/**
 * The lesson quiz on its own page rather than stacked under the player.
 * Sitting it below the video meant it competed with the video for the
 * reader's attention and could be answered while the lesson was still
 * playing; on its own route it is a deliberate step, and it can be linked
 * to from the curriculum like any other item.
 *
 * Unlike a module test (AssessmentView) this is practice, not an exam —
 * no countdown, no tab rule. The one rule it keeps is the server's: the
 * lesson has to be watched to the end before answers are accepted.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const loading = ref(true)
const submitting = ref(false)
const errorMessage = ref('')
const quiz = ref(null)
const video = ref(null)
const selected = reactive({})
const result = ref(null)

const answeredCount = computed(
  () => (quiz.value?.questions ?? []).filter((q) => selected[q.id] !== undefined).length
)
const allAnswered = computed(
  () => Boolean(quiz.value?.questions.length) && answeredCount.value === quiz.value.questions.length
)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [quizData, videoData] = await Promise.all([
      quizzesApi.getQuiz(route.params.id),
      videosApi.getById(route.params.id),
    ])
    quiz.value = quizData
    video.value = videoData
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

function choose(questionId, optionIndex) {
  if (result.value) return
  selected[questionId] = optionIndex
}

async function submit() {
  if (!allAnswered.value || submitting.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const answers = quiz.value.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIndex: selected[q.id],
    }))
    result.value = await quizzesApi.submitQuiz(route.params.id, answers)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    submitting.value = false
  }
}

function retry() {
  result.value = null
  for (const key of Object.keys(selected)) delete selected[key]
}

function backToVideo() {
  router.push(`/videos/${route.params.id}`)
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-bg pb-12">
    <div v-if="loading" class="mx-auto max-w-6xl px-6 py-8 mt-12 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton class="h-64 w-full rounded-xl" />
    </div>
    <div v-else-if="!quiz" class="mx-auto max-w-3xl px-6 py-12">
      <ErrorState :title="errorMessage || t('quiz.notFound')" @retry="load" />
    </div>

    <template v-else>
      <!-- Full Width Hero Banner -->
      <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
        <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900"></div>
        <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMnYtNGg0VjRoLTR6TTYuNiAyNy41MmwxLjc2LTMuMy0xLjc2LTMuM0g0LjRsLTEuNzYgMy4zIDEuNzYgMy4zaDIuMnptMjMuNi0xMy4yTDI4LjQ0IDExbDEuNzYtMy4zSDMyLjRsMS43NiAzLjMtMS43NiAzLjNoLTIuMnptMjMuNi0xMy4yTDUyLjA0LS4ybDEuNzYtMy4zSDU2bDEuNzYgMy4zLTEuNzYgMy4zaC0yLjJ6IiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvZz48L3N2Zz4=')]"></div>
        
        <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
          <button
            type="button"
            class="mb-6 flex items-center gap-1.5 text-small font-medium text-white/70 transition-default hover:text-white"
            @click="backToVideo"
          >
            <Icon name="chevron-left" size="16" />
            {{ video?.title ?? t('quiz.backToVideo') }}
          </button>
          
          <div class="flex items-center gap-4 mb-4">
            <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 backdrop-blur-sm shadow-inner">
              <Icon name="file-text" size="28" />
            </span>
            <div class="min-w-0">
              <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ t('quiz.title') }}</h1>
              <p v-if="video" class="mt-2 text-body text-white/80 drop-shadow">{{ video.title }}</p>
            </div>
          </div>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-white/70 font-medium">
            <span>{{ t('assessment.questionCount', { count: quiz.questions.length }) }}</span>
            <span>·</span>
            <span>{{ t('assessment.passScore', { value: quiz.passScorePercent }) }}</span>
          </p>
        </div>
      </div>

      <div class="mx-auto max-w-[1440px] px-6 lg:px-8 mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div class="lg:col-span-3">

      <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

      <!-- Result -->
      <AppCard
        v-if="result"
        class="mt-6 border shadow-sm"
        :class="result.passed ? 'border-success bg-success/5' : 'border-danger bg-danger/5'"
      >
        <div class="flex items-center gap-2">
          <Icon
            :name="result.passed ? 'check-circle' : 'alert-circle'"
            size="24"
            :class="result.passed ? 'text-success' : 'text-danger'"
          />
          <p class="text-h2" :class="result.passed ? 'text-success' : 'text-danger'">
            {{ result.passed ? t('quiz.passed') : t('quiz.failed') }}
          </p>
        </div>
        <p class="mt-2 text-small text-ink-muted">
          {{ t('quiz.score') }}: {{ result.scorePercent }}%
          ({{ t('assessment.passScore', { value: result.passScorePercent }) }})
        </p>
        <p v-if="result.pointsAwarded > 0" class="mt-1.5 flex items-center gap-1.5 text-small font-medium text-ink">
          <Icon name="award" size="15" />
          +{{ result.pointsAwarded }} {{ t('gamification.points') }}
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <AppButton v-if="!result.passed" variant="outline" icon="refresh" @click="retry">
            {{ t('quiz.retry') }}
          </AppButton>
          <AppButton variant="secondary" @click="backToVideo">{{ t('quiz.backToVideo') }}</AppButton>
        </div>
      </AppCard>

      <!-- Questions -->
      <AppCard v-else class="mt-6 border border-border shadow-sm rounded-xl">
        <div class="space-y-6">
          <div v-for="(question, qIndex) in quiz.questions" :key="question.id">
            <p class="text-small font-medium text-ink">{{ qIndex + 1 }}. {{ question.text }}</p>
            <div class="mt-2.5 space-y-1.5">
              <label
                v-for="(option, oIndex) in question.options"
                :key="option.id"
                class="flex cursor-pointer items-start gap-2.5 rounded-md border px-4 py-3 text-small transition-default"
                :class="
                  selected[question.id] === oIndex
                    ? 'border-primary bg-primary/5 text-ink'
                    : 'border-border text-ink-muted hover:bg-surface-2'
                "
              >
                <input
                  type="radio"
                  class="mt-0.5"
                  :name="question.id"
                  :checked="selected[question.id] === oIndex"
                  @change="choose(question.id, oIndex)"
                />
                <span>{{ option.text }}</span>
              </label>
            </div>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p class="text-small text-ink-muted">
            {{ t('assessment.answered', { answered: answeredCount, total: quiz.questions.length }) }}
          </p>
          <AppButton :disabled="!allAnswered" :loading="submitting" @click="submit">
            {{ t('quiz.submit') }}
          </AppButton>
        </div>
      </AppCard>
        </div>
      </div>
    </template>
  </div>
</template>
