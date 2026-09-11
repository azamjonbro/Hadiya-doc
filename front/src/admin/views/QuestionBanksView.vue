<script setup>
/**
 * Question banks, and the questions in them.
 *
 * The reason banks exist at all: the same twenty safety questions feed the
 * onboarding test, the annual refresher and a random pool, and fixing the
 * wording of one has to fix all three. Until 4.1 a question was embedded in
 * one quiz, so the same question existed as three unrelated copies.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { questionsApi } from '@/services/questions'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import QuestionPayloadEditor from '@/admin/components/questions/QuestionPayloadEditor.vue'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const TYPES = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'NUMERIC',
  'MATCHING',
  'SEQUENCE',
  'FILL_BLANK',
  'SELECT_LIST',
  'HOTSPOT',
  'LIKERT',
  'DRAG_DROP',
  'DRAG_WORDS',
  'ESSAY',
]

// A blank payload per type. Kept here rather than in the editor so switching
// type resets to something valid instead of carrying half of the previous
// type's shape into the new one — which is how you save a MATCHING question
// that still has `options` on it.
const EMPTY_PAYLOAD = {
  SINGLE_CHOICE: () => ({ options: [{ id: 'o1', text: '', isCorrect: true }, { id: 'o2', text: '' }] }),
  MULTI_CHOICE: () => ({ options: [{ id: 'o1', text: '', isCorrect: true }, { id: 'o2', text: '' }] }),
  TRUE_FALSE: () => ({ correct: true }),
  SHORT_ANSWER: () => ({ accepted: [''], caseSensitive: false }),
  NUMERIC: () => ({ value: 0, tolerance: 0 }),
  MATCHING: () => ({ pairs: [{ left: '', right: '' }, { left: '', right: '' }] }),
  SEQUENCE: () => ({ items: ['', ''] }),
  FILL_BLANK: () => ({ template: '', blanks: [{ accepted: [] }] }),
  SELECT_LIST: () => ({ blanks: [{ options: [], correctIndex: 0 }] }),
  HOTSPOT: () => ({ imageKey: '', areas: [{ x: 10, y: 10, w: 20, h: 20, isCorrect: true }] }),
  LIKERT: () => ({ scale: 5, labels: [] }),
  DRAG_DROP: () => ({ zones: [{ id: 'z1', label: '' }], items: [{ id: 'i1', text: '', zoneId: 'z1' }] }),
  DRAG_WORDS: () => ({ zones: [{ id: 'z1', label: '' }], items: [{ id: 'i1', text: '', zoneId: 'z1' }] }),
  ESSAY: () => ({ minWords: 0, maxWords: 0 }),
}

const banks = ref([])
const courses = ref([])
const selectedBankId = ref('')
const questions = ref([])
const nextCursor = ref(null)
const loadingBanks = ref(true)
const loadingQuestions = ref(false)
const search = ref('')
const typeFilter = ref('')

const bankModal = ref(false)
const bankDraft = ref({ name: '', description: '', courseId: '' })

const questionModal = ref(false)
const draft = ref(null)
const saving = ref(false)

const selectedBank = computed(() => banks.value.find((bank) => bank.id === selectedBankId.value) ?? null)

async function loadBanks() {
  loadingBanks.value = true
  try {
    banks.value = await questionsApi.banks()
    if (!selectedBankId.value && banks.value.length) selectedBankId.value = banks.value[0].id
  } catch (error) {
    toast.error(apiErrorText(error, t('questions.loadError')))
  } finally {
    loadingBanks.value = false
  }
}

async function loadQuestions({ append = false } = {}) {
  if (!selectedBankId.value) {
    questions.value = []
    return
  }
  loadingQuestions.value = true
  try {
    const result = await questionsApi.list({
      bankId: selectedBankId.value,
      type: typeFilter.value || undefined,
      search: search.value || undefined,
      limit: 50,
      cursor: append ? nextCursor.value : undefined,
    })
    questions.value = append ? [...questions.value, ...result.items] : result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    toast.error(apiErrorText(error, t('questions.loadError')))
  } finally {
    loadingQuestions.value = false
  }
}

watch(selectedBankId, () => loadQuestions())

function openBankModal() {
  bankDraft.value = { name: '', description: '', courseId: '' }
  bankModal.value = true
}

async function saveBank() {
  if (!bankDraft.value.name.trim()) return
  try {
    const created = await questionsApi.createBank({
      name: bankDraft.value.name.trim(),
      description: bankDraft.value.description.trim() || undefined,
      courseId: bankDraft.value.courseId || null,
    })
    bankModal.value = false
    await loadBanks()
    selectedBankId.value = created.id
    toast.success(t('questions.bankCreated'))
  } catch (error) {
    toast.error(apiErrorText(error, t('questions.saveError')))
  }
}

async function removeBank(bank) {
  const ok = await confirm({ title: t('questions.deleteBankTitle'), message: t('questions.deleteBankMessage', { name: bank.name }) })
  if (!ok) return
  try {
    await questionsApi.deleteBank(bank.id)
    if (selectedBankId.value === bank.id) selectedBankId.value = ''
    await loadBanks()
    toast.success(t('questions.bankDeleted'))
  } catch (error) {
    // The server refuses while a test still draws from it, and says which.
    toast.error(apiErrorText(error, t('questions.deleteError')))
  }
}

function newQuestion() {
  draft.value = {
    bankId: selectedBankId.value,
    type: 'SINGLE_CHOICE',
    text: '',
    explanation: '',
    points: 1,
    penalty: 0,
    difficulty: 'MEDIUM',
    tags: [],
    payload: EMPTY_PAYLOAD.SINGLE_CHOICE(),
  }
  questionModal.value = true
}

function editQuestion(question) {
  draft.value = JSON.parse(JSON.stringify(question))
  questionModal.value = true
}

function onTypeChange(type) {
  // A fresh payload, not a merge. Carrying the old shape across is how a
  // MATCHING question ends up saved with an `options` array on it.
  draft.value.type = type
  draft.value.payload = EMPTY_PAYLOAD[type]()
}

async function saveQuestion() {
  if (!draft.value.text.trim()) {
    toast.error(t('questions.textRequired'))
    return
  }
  saving.value = true
  try {
    const payload = {
      bankId: draft.value.bankId,
      type: draft.value.type,
      text: draft.value.text.trim(),
      explanation: draft.value.explanation?.trim() || undefined,
      points: Number(draft.value.points) || 1,
      penalty: Number(draft.value.penalty) || 0,
      difficulty: draft.value.difficulty,
      tags: draft.value.tags,
      payload: draft.value.payload,
    }
    if (draft.value.id) await questionsApi.update(draft.value.id, payload)
    else await questionsApi.create(payload)
    questionModal.value = false
    await Promise.all([loadQuestions(), loadBanks()])
    toast.success(t('questions.saved'))
  } catch (error) {
    // The server validates the payload against the type, so this is where a
    // half-filled matching question or a two-answer single-choice lands.
    toast.error(apiErrorText(error, t('questions.saveError')))
  } finally {
    saving.value = false
  }
}

async function removeQuestion(question) {
  const ok = await confirm({ title: t('questions.deleteTitle'), message: t('questions.deleteMessage') })
  if (!ok) return
  try {
    await questionsApi.remove(question.id)
    await Promise.all([loadQuestions(), loadBanks()])
    toast.success(t('questions.deleted'))
  } catch (error) {
    toast.error(apiErrorText(error, t('questions.deleteError')))
  }
}

const difficultyVariant = { EASY: 'success', MEDIUM: 'info', HARD: 'warning' }

onMounted(async () => {
  await loadBanks()
  await loadQuestions()
  coursesApi
    .list({ limit: 100 })
    .then((result) => {
      courses.value = result.items
    })
    .catch(() => {
      courses.value = []
    })
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[28px] font-bold text-ink">{{ t('questions.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('questions.subtitle') }}</p>
      </div>
      <AppButton icon="plus" @click="openBankModal">{{ t('questions.newBank') }}</AppButton>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- Banks -->
      <AppCard class="h-fit p-3">
        <div v-if="loadingBanks" class="space-y-2">
          <Skeleton v-for="n in 4" :key="n" class="h-12 w-full rounded-lg" />
        </div>
        <EmptyState
          v-else-if="!banks.length"
          icon="layers"
          :title="t('questions.noBanks')"
          :description="t('questions.noBanksHint')"
        />
        <div v-else class="space-y-1">
          <button
            v-for="bank in banks"
            :key="bank.id"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-default"
            :class="bank.id === selectedBankId ? 'bg-primary-subtle text-primary' : 'text-ink hover:bg-surface-hover'"
            @click="selectedBankId = bank.id"
          >
            <span class="min-w-0">
              <span class="block truncate text-small font-medium">{{ bank.name }}</span>
              <span class="block text-caption text-ink-faint">
                {{ t('questions.questionCount', { count: bank.questionCount }) }}
                <template v-if="!bank.courseId"> · {{ t('questions.global') }}</template>
              </span>
            </span>
            <Icon name="trash" size="14" class="shrink-0 text-ink-faint" @click.stop="removeBank(bank)" />
          </button>
        </div>
      </AppCard>

      <!-- Questions -->
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <AppInput
            v-model="search"
            class="w-56"
            icon="search"
            :placeholder="t('questions.searchPlaceholder')"
            @keyup.enter="loadQuestions()"
          />
          <AppSelect
            v-model="typeFilter"
            class="w-48"
            :placeholder="t('questions.allTypes')"
            :options="TYPES.map((type) => ({ value: type, label: t(`questions.type.${type}`) }))"
            @update:model-value="loadQuestions()"
          />
          <AppButton variant="outline" icon="search" @click="loadQuestions()">{{ t('common.search') }}</AppButton>
          <AppButton v-if="selectedBank" icon="plus" @click="newQuestion">{{ t('questions.newQuestion') }}</AppButton>
        </div>

        <div v-if="loadingQuestions && !questions.length" class="mt-4 space-y-2">
          <Skeleton v-for="n in 5" :key="n" class="h-16 w-full rounded-lg" />
        </div>
        <EmptyState
          v-else-if="!questions.length"
          class="mt-4"
          icon="check-square"
          :title="t('questions.noQuestions')"
          :description="t('questions.noQuestionsHint')"
        />
        <div v-else class="mt-4 space-y-2">
          <AppCard v-for="question in questions" :key="question.id" class="flex items-start justify-between gap-4 p-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="neutral" size="sm">{{ t(`questions.type.${question.type}`) }}</Badge>
                <Badge :variant="difficultyVariant[question.difficulty]" size="sm">
                  {{ t(`questions.difficulty.${question.difficulty}`) }}
                </Badge>
                <span class="text-caption text-ink-faint">{{ t('questions.points', { points: question.points }) }}</span>
              </div>
              <p class="mt-1.5 line-clamp-2 text-small text-ink">{{ question.text }}</p>
              <div v-if="question.tags?.length" class="mt-1.5 flex flex-wrap gap-1">
                <span v-for="tag in question.tags" :key="tag" class="rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink-muted">
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="flex shrink-0 gap-1">
              <AppButton variant="ghost" size="sm" icon="pencil" @click="editQuestion(question)" />
              <AppButton variant="ghost" size="sm" icon="trash" @click="removeQuestion(question)" />
            </div>
          </AppCard>
          <div v-if="nextCursor" class="text-center">
            <AppButton variant="secondary" :loading="loadingQuestions" @click="loadQuestions({ append: true })">
              {{ t('common.loadMore') }}
            </AppButton>
          </div>
        </div>
      </div>
    </div>

    <!-- New bank -->
    <Modal v-model="bankModal" :title="t('questions.newBank')">
      <div class="space-y-3">
        <AppInput v-model="bankDraft.name" :label="t('questions.bankName')" required />
        <AppInput v-model="bankDraft.description" :label="t('questions.bankDescription')" />
        <AppSelect
          v-model="bankDraft.courseId"
          :label="t('questions.bankCourse')"
          :placeholder="t('questions.globalBank')"
          :hint="t('questions.bankCourseHint')"
          :options="courses.map((course) => ({ value: course.id, label: course.title }))"
        />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="bankModal = false">{{ t('common.cancel') }}</AppButton>
        <AppButton @click="saveBank">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <!-- Question editor -->
    <Modal v-model="questionModal" :title="draft?.id ? t('questions.editQuestion') : t('questions.newQuestion')" size="lg">
      <div v-if="draft" class="space-y-4">
        <AppSelect
          :model-value="draft.type"
          :label="t('questions.type.label')"
          :options="TYPES.map((type) => ({ value: type, label: t(`questions.type.${type}`) }))"
          @update:model-value="onTypeChange"
        />
        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('questions.text') }}</label>
          <textarea
            v-model="draft.text"
            rows="3"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <QuestionPayloadEditor v-model="draft.payload" :type="draft.type" />

        <div class="grid gap-3 sm:grid-cols-3">
          <AppInput v-model="draft.points" type="number" :label="t('questions.pointsLabel')" />
          <AppInput v-model="draft.penalty" type="number" :label="t('questions.penalty')" :hint="t('questions.penaltyHint')" />
          <AppSelect
            v-model="draft.difficulty"
            :label="t('questions.difficultyLabel')"
            :options="['EASY', 'MEDIUM', 'HARD'].map((level) => ({ value: level, label: t(`questions.difficulty.${level}`) }))"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('questions.explanation') }}</label>
          <textarea
            v-model="draft.explanation"
            rows="2"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <p class="mt-1 text-caption text-ink-faint">{{ t('questions.explanationHint') }}</p>
        </div>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="questionModal = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="saveQuestion">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
