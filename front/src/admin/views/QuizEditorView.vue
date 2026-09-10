<script setup>
/**
 * Editing one unified test: its rules, the questions on it, and how it has
 * actually been performing.
 *
 * The statistics panel is here rather than on its own page on purpose. The
 * question an author asks — "is this question badly worded?" — is answered
 * by looking at the pass rate *while* editing the question, not by
 * remembering a number from another screen.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { questionsApi, quizzesApi } from '@/services/questions'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import Tabs from '@/components/ui/Tabs.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const quizId = route.params.id
const quiz = ref(null)
const loading = ref(true)
const saving = ref(false)
const tab = ref('questions')
const stats = ref(null)
const loadingStats = ref(false)

const banks = ref([])
const pickerOpen = ref(false)
const pickerBankId = ref('')
const pickerQuestions = ref([])
const pickerSelection = ref(new Set())

const tabs = computed(() => [
  { value: 'questions', label: t('quizEditor.tabs.questions'), count: quiz.value?.questions?.length ?? 0 },
  { value: 'settings', label: t('quizEditor.tabs.settings') },
  { value: 'stats', label: t('quizEditor.tabs.stats') },
])

async function load() {
  loading.value = true
  try {
    quiz.value = await quizzesApi.getById(quizId)
  } catch (error) {
    toast.error(apiErrorText(error, t('quizEditor.loadError')))
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  loadingStats.value = true
  try {
    stats.value = await quizzesApi.stats(quizId)
  } catch (error) {
    toast.error(apiErrorText(error, t('quizEditor.statsError')))
  } finally {
    loadingStats.value = false
  }
}

function switchTab(value) {
  tab.value = value
  if (value === 'stats' && !stats.value) loadStats()
}

async function save() {
  saving.value = true
  try {
    await quizzesApi.update(quizId, {
      title: quiz.value.title,
      description: quiz.value.description,
      questionIds: quiz.value.questionIds,
      pools: quiz.value.pools,
      passScorePercent: Number(quiz.value.passScorePercent) || 0,
      maxAttempts: Number(quiz.value.maxAttempts) || 0,
      timeLimitMinutes: Number(quiz.value.timeLimitMinutes) || 0,
      shuffleQuestions: quiz.value.shuffleQuestions,
      shuffleOptions: quiz.value.shuffleOptions,
      partialCredit: quiz.value.partialCredit,
      revealMode: quiz.value.revealMode,
      scorePolicy: quiz.value.scorePolicy,
      focusLossLimit: Number(quiz.value.focusLossLimit) || 0,
      pointsEnabled: quiz.value.pointsEnabled,
      points: Number(quiz.value.points) || 0,
      status: quiz.value.status,
    })
    toast.success(t('quizEditor.saved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('quizEditor.saveError')))
  } finally {
    saving.value = false
  }
}

async function openPicker() {
  pickerOpen.value = true
  pickerSelection.value = new Set()
  try {
    if (!banks.value.length) banks.value = await questionsApi.banks()
  } catch (error) {
    toast.error(apiErrorText(error, t('questionBanks.loadFailed')))
    return
  }
  if (!pickerBankId.value && banks.value.length) pickerBankId.value = banks.value[0].id
  await loadPickerQuestions()
}

async function loadPickerQuestions() {
  if (!pickerBankId.value) return
  let result
  try {
    result = await questionsApi.list({ bankId: pickerBankId.value, limit: 100 })
  } catch (error) {
    pickerQuestions.value = []
    toast.error(apiErrorText(error, t('questionBanks.loadFailed')))
    return
  }
  // Questions already on the paper are filtered out rather than shown
  // greyed: adding one twice would ask it twice and mark it twice.
  const already = new Set(quiz.value?.questionIds ?? [])
  pickerQuestions.value = result.items.filter((question) => !already.has(question.id))
}

function togglePick(id) {
  const next = new Set(pickerSelection.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  pickerSelection.value = next
}

function addPicked() {
  quiz.value.questionIds = [...quiz.value.questionIds, ...pickerSelection.value]
  quiz.value.questions = [
    ...quiz.value.questions,
    ...pickerQuestions.value.filter((question) => pickerSelection.value.has(question.id)),
  ]
  pickerOpen.value = false
}

function removeQuestion(index) {
  quiz.value.questionIds.splice(index, 1)
  quiz.value.questions.splice(index, 1)
}

function moveQuestion(index, delta) {
  const target = index + delta
  if (target < 0 || target >= quiz.value.questions.length) return
  for (const list of [quiz.value.questionIds, quiz.value.questions]) {
    const [item] = list.splice(index, 1)
    list.splice(target, 0, item)
  }
}

async function addPool() {
  try {
    if (!banks.value.length) banks.value = await questionsApi.banks()
  } catch (error) {
    toast.error(apiErrorText(error, t('questionBanks.loadFailed')))
    return
  }
  quiz.value.pools.push({ bankId: banks.value[0]?.id ?? '', count: 5, tags: [], difficulty: '' })
}

async function removeQuiz() {
  const ok = await confirm({ title: t('quizEditor.deleteTitle'), message: t('quizEditor.deleteMessage') })
  if (!ok) return
  try {
    await quizzesApi.remove(quizId)
    router.back()
  } catch (error) {
    // Refused once anybody has sat it — those attempts are somebody's
    // record of passing a mandatory course.
    toast.error(apiErrorText(error, t('quizEditor.deleteError')))
  }
}

const rateVariant = (rate) => (rate >= 80 ? 'success' : rate >= 45 ? 'info' : 'danger')

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small text-ink-muted hover:text-ink" @click="router.back()">
      <Icon name="chevron-left" size="16" />
      {{ t('common.goBack') }}
    </button>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-lg" />
    </div>

    <template v-else-if="quiz">
      <div class="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-h1 text-ink">{{ quiz.title }}</h1>
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge :variant="quiz.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
              {{ t(`quizEditor.status.${quiz.status}`) }}
            </Badge>
            <Badge variant="neutral" size="sm">{{ t(`quizEditor.scope.${quiz.scope}`) }}</Badge>
            <span class="text-caption text-ink-faint">
              {{ t('quizEditor.questionCount', { count: quiz.questionCount }) }}
            </span>
          </div>
        </div>
        <div class="flex gap-2">
          <AppButton variant="ghost" icon="trash" @click="removeQuiz" />
          <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
        </div>
      </div>

      <Tabs :model-value="tab" :tabs="tabs" class="mt-6" @update:model-value="switchTab" />

      <!-- Questions -->
      <div v-if="tab === 'questions'" class="mt-6 space-y-6">
        <AppCard class="p-4">
          <div class="flex items-center justify-between">
            <p class="text-small font-medium text-ink">{{ t('quizEditor.fixedQuestions') }}</p>
            <AppButton size="sm" icon="plus" @click="openPicker">{{ t('quizEditor.addQuestions') }}</AppButton>
          </div>
          <p class="mt-1 text-caption text-ink-faint">{{ t('quizEditor.fixedHint') }}</p>

          <EmptyState
            v-if="!quiz.questions.length"
            class="py-8"
            icon="check-square"
            :title="t('quizEditor.noQuestions')"
            :description="t('quizEditor.noQuestionsHint')"
          />
          <div v-else class="mt-3 space-y-1.5">
            <div
              v-for="(question, index) in quiz.questions"
              :key="question.id"
              class="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
            >
              <span class="w-5 shrink-0 text-caption text-ink-faint">{{ index + 1 }}.</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-small text-ink">{{ question.text }}</p>
                <p class="text-caption text-ink-faint">
                  {{ t(`questions.type.${question.type}`) }} · {{ t('questions.points', { points: question.points }) }}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <AppButton variant="ghost" size="sm" icon="chevron-up" @click="moveQuestion(index, -1)" />
                <AppButton variant="ghost" size="sm" icon="chevron-down" @click="moveQuestion(index, 1)" />
                <AppButton variant="ghost" size="sm" icon="trash" @click="removeQuestion(index)" />
              </div>
            </div>
          </div>
        </AppCard>

        <AppCard class="p-4">
          <div class="flex items-center justify-between">
            <p class="text-small font-medium text-ink">{{ t('quizEditor.pools') }}</p>
            <AppButton size="sm" variant="secondary" icon="plus" @click="addPool">{{ t('quizEditor.addPool') }}</AppButton>
          </div>
          <p class="mt-1 text-caption text-ink-faint">{{ t('quizEditor.poolsHint') }}</p>

          <div v-for="(pool, index) in quiz.pools" :key="index" class="mt-3 flex flex-wrap items-end gap-2">
            <AppSelect
              class="w-56"
              :model-value="pool.bankId"
              :label="t('quizEditor.bank')"
              :options="banks.map((bank) => ({ value: bank.id, label: `${bank.name} (${bank.questionCount})` }))"
              @update:model-value="(value) => (pool.bankId = value)"
            />
            <AppInput class="w-28" type="number" :label="t('quizEditor.howMany')" :model-value="pool.count" @update:model-value="(value) => (pool.count = Number(value))" />
            <AppSelect
              class="w-40"
              :model-value="pool.difficulty"
              :label="t('questions.difficultyLabel')"
              :placeholder="t('quizEditor.anyDifficulty')"
              :options="['EASY', 'MEDIUM', 'HARD'].map((level) => ({ value: level, label: t(`questions.difficulty.${level}`) }))"
              @update:model-value="(value) => (pool.difficulty = value)"
            />
            <AppButton variant="ghost" size="sm" icon="trash" @click="quiz.pools.splice(index, 1)" />
          </div>
        </AppCard>
      </div>

      <!-- Settings -->
      <div v-else-if="tab === 'settings'" class="mt-6 space-y-4">
        <AppCard class="space-y-4 p-4">
          <AppInput v-model="quiz.title" :label="t('quizEditor.title')" />
          <div class="grid gap-4 sm:grid-cols-3">
            <AppInput v-model="quiz.passScorePercent" type="number" :label="t('quizEditor.passScore')" />
            <AppInput v-model="quiz.maxAttempts" type="number" :label="t('quizEditor.maxAttempts')" :hint="t('quizEditor.zeroUnlimited')" />
            <AppInput v-model="quiz.timeLimitMinutes" type="number" :label="t('quizEditor.timeLimit')" :hint="t('quizEditor.zeroNoLimit')" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <AppSelect
              v-model="quiz.scorePolicy"
              :label="t('quizEditor.scorePolicy')"
              :hint="t('quizEditor.scorePolicyHint')"
              :options="['LAST', 'BEST', 'FIRST', 'AVERAGE'].map((value) => ({ value, label: t(`quizEditor.policy.${value}`) }))"
            />
            <AppSelect
              v-model="quiz.revealMode"
              :label="t('quizEditor.revealMode')"
              :hint="t('quizEditor.revealHint')"
              :options="['NEVER', 'AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_LAST_ATTEMPT'].map((value) => ({ value, label: t(`quizEditor.reveal.${value}`) }))"
            />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <AppInput v-model="quiz.focusLossLimit" type="number" :label="t('quizEditor.focusLossLimit')" :hint="t('quizEditor.focusLossHint')" />
            <AppSelect
              v-model="quiz.status"
              :label="t('quizEditor.statusLabel')"
              :options="['DRAFT', 'PUBLISHED'].map((value) => ({ value, label: t(`quizEditor.status.${value}`) }))"
            />
          </div>
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-small text-ink">
              <input v-model="quiz.shuffleQuestions" type="checkbox" class="h-4 w-4 rounded border-border-strong" />
              {{ t('quizEditor.shuffleQuestions') }}
            </label>
            <label class="flex items-center gap-2 text-small text-ink">
              <input v-model="quiz.shuffleOptions" type="checkbox" class="h-4 w-4 rounded border-border-strong" />
              {{ t('quizEditor.shuffleOptions') }}
            </label>
            <label class="flex items-center gap-2 text-small text-ink">
              <input v-model="quiz.partialCredit" type="checkbox" class="h-4 w-4 rounded border-border-strong" />
              {{ t('quizEditor.partialCredit') }}
            </label>
            <p class="text-caption text-ink-faint">{{ t('quizEditor.partialCreditHint') }}</p>
          </div>
        </AppCard>
      </div>

      <!-- Statistics -->
      <div v-else class="mt-6">
        <div v-if="loadingStats" class="space-y-2">
          <Skeleton v-for="n in 4" :key="n" class="h-14 w-full rounded-lg" />
        </div>
        <EmptyState
          v-else-if="!stats || !stats.questions.length"
          icon="bar-chart"
          :title="t('quizEditor.noStats')"
          :description="t('quizEditor.noStatsHint')"
        />
        <template v-else>
          <div class="flex flex-wrap gap-4">
            <AppCard class="flex-1 p-4">
              <p class="text-caption text-ink-muted">{{ t('quizEditor.attempts') }}</p>
              <p class="mt-1 text-h2 text-ink">{{ stats.attempts }}</p>
            </AppCard>
            <AppCard class="flex-1 p-4">
              <p class="text-caption text-ink-muted">{{ t('quizEditor.passRate') }}</p>
              <p class="mt-1 text-h2 text-ink">{{ stats.passRate }}%</p>
            </AppCard>
          </div>

          <p v-if="stats.suspicious.length" class="mt-4 flex items-center gap-1.5 text-small text-warning">
            <Icon name="alert-triangle" size="15" />
            {{ t('quizEditor.suspicious', { count: stats.suspicious.length }) }}
          </p>

          <AppCard class="mt-4 overflow-x-auto p-0">
            <table class="w-full text-small">
              <thead class="border-b border-border text-left text-ink-muted">
                <tr>
                  <th class="px-4 py-3 font-medium">{{ t('questions.text') }}</th>
                  <th class="px-4 py-3 font-medium">{{ t('quizEditor.asked') }}</th>
                  <th class="px-4 py-3 font-medium">{{ t('quizEditor.correctRate') }}</th>
                  <th class="px-4 py-3 font-medium">{{ t('quizEditor.declared') }}</th>
                  <th class="px-4 py-3 font-medium">{{ t('quizEditor.observed') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in stats.questions"
                  :key="row.questionId"
                  class="border-b border-border last:border-0"
                  :class="stats.suspicious.includes(row.questionId) ? 'bg-warning-subtle/40' : ''"
                >
                  <td class="max-w-md px-4 py-3 text-ink">
                    <span class="line-clamp-2">{{ row.text }}</span>
                  </td>
                  <td class="px-4 py-3 text-ink-muted">{{ row.asked }}</td>
                  <td class="px-4 py-3">
                    <Badge :variant="rateVariant(row.correctRate)" size="sm">{{ row.correctRate }}%</Badge>
                  </td>
                  <td class="px-4 py-3 text-ink-muted">
                    {{ row.declaredDifficulty ? t(`questions.difficulty.${row.declaredDifficulty}`) : '—' }}
                  </td>
                  <td class="px-4 py-3 text-ink-muted">{{ t(`questions.difficulty.${row.observedDifficulty}`) }}</td>
                </tr>
              </tbody>
            </table>
          </AppCard>
        </template>
      </div>
    </template>

    <!-- Question picker -->
    <Modal v-model="pickerOpen" :title="t('quizEditor.addQuestions')" size="lg">
      <div class="space-y-3">
        <AppSelect
          v-model="pickerBankId"
          :label="t('quizEditor.bank')"
          :options="banks.map((bank) => ({ value: bank.id, label: `${bank.name} (${bank.questionCount})` }))"
          @update:model-value="loadPickerQuestions"
        />
        <EmptyState
          v-if="!pickerQuestions.length"
          class="py-6"
          icon="check-square"
          :title="t('quizEditor.pickerEmpty')"
          :description="t('quizEditor.pickerEmptyHint')"
        />
        <div v-else class="max-h-80 space-y-1 overflow-y-auto">
          <button
            v-for="question in pickerQuestions"
            :key="question.id"
            type="button"
            class="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-default"
            :class="pickerSelection.has(question.id) ? 'bg-primary-subtle' : 'hover:bg-surface-hover'"
            @click="togglePick(question.id)"
          >
            <span
              class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
              :class="pickerSelection.has(question.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'"
            >
              <Icon v-if="pickerSelection.has(question.id)" name="check" size="11" />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-small text-ink">{{ question.text }}</span>
              <span class="block text-caption text-ink-faint">{{ t(`questions.type.${question.type}`) }}</span>
            </span>
          </button>
        </div>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="pickerOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :disabled="!pickerSelection.size" @click="addPicked">
          {{ t('quizEditor.addSelected', { count: pickerSelection.size }) }}
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
