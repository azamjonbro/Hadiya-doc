<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { formatDateTime, scoreTone } from '@/utils/format'
import StatCard from '@/admin/components/dashboard/StatCard.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import TabError from './TabError.vue'

const props = defineProps({
  userId: { type: String, required: true },
})

const { t, locale } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const data = ref(null)
const expandedTestId = ref(null)
const onlyFailed = ref(false)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await usersApi.testResults(props.userId)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

const summary = computed(() => data.value?.summary ?? {})

const visibleTests = computed(() => {
  const tests = data.value?.tests ?? []
  return onlyFailed.value ? tests.filter((test) => !test.passed) : tests
})

function toggle(testId) {
  expandedTestId.value = expandedTestId.value === testId ? null : testId
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="space-y-4">
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>

    <TabError v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else-if="data">
      <EmptyState
        v-if="!data.tests.length"
        icon="file-text"
        :title="t('employee.tests.empty')"
        :description="t('employee.tests.emptyHint')"
      />

      <template v-else>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard size="compact" :label="t('employee.tests.taken')" :value="summary.testsTaken" />
          <StatCard size="compact" :label="t('employee.tests.averageScore')" :value="summary.averageScore ?? '—'" suffix="%" />
          <StatCard size="compact" :label="t('employee.tests.firstTryPass')" :value="summary.firstTryPassRate ?? '—'" suffix="%" />
          <StatCard size="compact" :label="t('employee.tests.wrongAnswers')" :value="summary.wrongAnswers" />
        </div>

        <!-- Where they keep going wrong -->
        <div v-if="data.weakQuestions.length" class="mt-5 rounded-lg border border-border bg-surface p-5">
          <div class="flex items-center gap-2">
            <Icon name="alert-circle" size="16" class="text-warning" />
            <h3 class="text-small font-semibold text-ink">{{ t('employee.tests.weakSpots') }}</h3>
          </div>
          <p class="mt-1 text-caption text-ink-muted">{{ t('employee.tests.weakSpotsHint') }}</p>
          <ul class="mt-3 divide-y divide-border">
            <li v-for="(row, index) in data.weakQuestions.slice(0, 8)" :key="index" class="py-2.5 first:pt-0 last:pb-0">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-small text-ink">{{ row.questionText }}</p>
                  <p class="mt-0.5 text-caption text-ink-faint">
                    {{ row.testTitle }}<template v-if="row.courseTitle"> · {{ row.courseTitle }}</template>
                  </p>
                  <p class="mt-1 text-caption text-success">
                    {{ t('employeeProgress.correctAnswer') }}: {{ row.correctOptionText }}
                  </p>
                </div>
                <Badge variant="danger" size="sm" class="shrink-0">
                  {{ t('employee.tests.wrongTimes', { count: row.wrongCount, total: row.totalCount }) }}
                </Badge>
              </div>
            </li>
          </ul>
        </div>

        <!-- Per-test history -->
        <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-h3 text-ink">{{ t('employee.tests.history') }}</h3>
          <label class="flex items-center gap-2 text-small text-ink-muted">
            <input v-model="onlyFailed" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
            {{ t('employee.tests.onlyFailed') }}
          </label>
        </div>

        <div class="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          <div v-for="test in visibleTests" :key="test.testId">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition-default hover:bg-surface-2"
              @click="toggle(test.testId)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                :class="test.passed ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'"
              >
                <Icon :name="test.passed ? 'check' : 'close'" size="13" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-small font-medium text-ink">{{ test.title || t('employee.tests.untitled') }}</p>
                <p class="mt-0.5 truncate text-caption text-ink-faint">
                  {{ t(`employee.tests.kind.${test.kind}`) }}
                  <template v-if="test.courseTitle"> · {{ test.courseTitle }}</template>
                  · {{ t('employee.tests.attempts', { count: test.attemptsCount }) }}
                  · {{ formatDateTime(test.lastAttemptAt, locale) }}
                </p>
              </div>
              <div class="hidden w-32 shrink-0 sm:block">
                <ProgressBar :value="test.bestScore" size="sm" :variant="scoreTone(test.bestScore)" />
              </div>
              <span class="w-12 shrink-0 text-right text-small font-semibold text-ink">{{ test.bestScore }}%</span>
              <Icon :name="expandedTestId === test.testId ? 'chevron-up' : 'chevron-down'" size="15" class="shrink-0 text-ink-faint" />
            </button>

            <div v-if="expandedTestId === test.testId" class="border-t border-border bg-surface-2 px-4 py-3">
              <div v-for="attempt in test.attempts" :key="attempt.id" class="mb-4 last:mb-0">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge :variant="attempt.passed ? 'success' : 'danger'" size="sm">
                    {{ attempt.scorePercent }}% — {{ attempt.passed ? t('employeeProgress.passed') : t('employeeProgress.failed') }}
                  </Badge>
                  <span class="text-caption text-ink-faint">{{ formatDateTime(attempt.createdAt, locale) }}</span>
                  <span v-if="test.passScorePercent !== null" class="text-caption text-ink-faint">
                    · {{ t('employee.tests.passMark', { value: test.passScorePercent }) }}
                  </span>
                </div>

                <ul class="mt-2 space-y-1.5">
                  <li v-for="answer in attempt.answers" :key="answer.questionId" class="flex items-start gap-1.5 text-caption">
                    <Icon
                      :name="answer.isCorrect ? 'check-circle' : 'alert-circle'"
                      size="13"
                      class="mt-0.5 shrink-0"
                      :class="answer.isCorrect ? 'text-success' : 'text-danger'"
                    />
                    <div class="min-w-0">
                      <p class="text-ink">{{ answer.questionText }}</p>
                      <p class="text-ink-faint">
                        {{ t('employeeProgress.answered') }}: {{ answer.selectedOptionText }}
                        <template v-if="!answer.isCorrect">
                          · <span class="text-success">{{ t('employeeProgress.correctAnswer') }}: {{ answer.correctOptionText }}</span>
                        </template>
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <p v-if="!visibleTests.length" class="px-4 py-6 text-center text-small text-ink-faint">
            {{ t('employee.tests.noFailed') }}
          </p>
        </div>
      </template>
    </template>
  </div>
</template>
