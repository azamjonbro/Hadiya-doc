<script setup>
/**
 * Cycles and the questionnaires they are built from.
 *
 * The rater preview is deliberately in the way of the launch button rather
 * than beside it: launching materialises a questionnaire for every person
 * the org chart puts around each subject, and it cannot be undone. The
 * preview computes the same list without creating anything, and it is the
 * only moment somebody can notice that a subject has two peers — i.e. that
 * their whole report will come back sealed by the anonymity gate.
 *
 * Templates live on this screen as a second tab, not on their own route: a
 * cycle is meaningless without its questions, and the two are edited in the
 * same sitting.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { review360Api } from '@/services/review360'
import { competenciesApi } from '@/services/competencies'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import { formatDate, toDateInputValue } from '@/utils/format'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import Tabs from '@/components/ui/Tabs.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import UserPicker from '@/components/ui/UserPicker.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()

const RATER_GROUPS = ['SELF', 'MANAGER', 'PEER', 'SUBORDINATE']

const tab = ref('cycles')
const cycles = ref([])
const templates = ref([])
const competencies = ref([])
const loading = ref(true)
const saving = ref(false)
const statusFilter = ref('')

const canManage = computed(() => auth.hasPermission('review360:manage'))

/* ---------------- cycle editor ---------------- */
const cycleModalOpen = ref(false)
const editingCycleId = ref('')
const cycleDraft = ref(emptyCycle())
const subjectPick = ref('')

/* ---------------- template editor ---------------- */
const templateModalOpen = ref(false)
const editingTemplateId = ref('')
const templateDraft = ref(emptyTemplate())

/* ---------------- rater preview ---------------- */
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewCycle = ref(null)
const preview = ref({ threshold: 3, subjects: [] })

function emptyCycle() {
  return {
    name: '',
    description: '',
    templateId: '',
    // Kept as {id, fullName} pairs so a chip can be labelled without a
    // second round trip; only the ids are sent.
    subjects: [],
    dueAt: '',
    postToCompetencies: false,
  }
}

function emptyTemplate() {
  return {
    name: '',
    description: '',
    status: 'DRAFT',
    raterGroups: [...RATER_GROUPS],
    maxPeers: 10,
    maxSubordinates: 10,
    anonymousGroups: ['MANAGER', 'PEER', 'SUBORDINATE'],
    anonymityThreshold: 3,
    questions: [],
  }
}

const statusOptions = computed(() => [
  { value: '', label: t('review360.allStatuses') },
  { value: 'DRAFT', label: t('review360.status.DRAFT') },
  { value: 'RUNNING', label: t('review360.status.RUNNING') },
  { value: 'CLOSED', label: t('review360.status.CLOSED') },
])

const templateOptions = computed(() =>
  templates.value.map((template) => ({
    value: template.id,
    label: `${template.name} · ${t(`review360.templateStatus.${template.status}`)}`,
  }))
)

const templateStatusOptions = computed(() =>
  ['DRAFT', 'ACTIVE', 'ARCHIVED'].map((value) => ({ value, label: t(`review360.templateStatus.${value}`) }))
)

const questionTypeOptions = computed(() =>
  ['RATING', 'TEXT'].map((value) => ({ value, label: t(`review360.questionType.${value}`) }))
)

const competencyOptions = computed(() => [
  { value: '', label: t('review360.competencyNone') },
  ...competencies.value.map((competency) => ({ value: competency.id, label: `${competency.code} · ${competency.name}` })),
])

const statusVariant = { DRAFT: 'neutral', RUNNING: 'primary', CLOSED: 'success' }
const templateStatusVariant = { DRAFT: 'neutral', ACTIVE: 'success', ARCHIVED: 'neutral' }

function templateName(id) {
  return templates.value.find((template) => template.id === id)?.name ?? '—'
}

function openCycle(cycle) {
  router.push({ name: 'admin-review360-cycle', params: { id: cycle.id } })
}

function percentOf(cycle) {
  return cycle.invited ? Math.round((cycle.responded / cycle.invited) * 100) : 0
}

async function load() {
  loading.value = true
  try {
    const params = statusFilter.value ? { status: statusFilter.value } : {}
    const [cycleRows, templateRows] = await Promise.all([review360Api.cycles(params), review360Api.templates()])
    cycles.value = cycleRows
    templates.value = templateRows
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.loadError')))
  } finally {
    loading.value = false
  }
}

/**
 * The catalogue is gated on the competency permissions, which a 360°
 * administrator does not necessarily hold. Failing quietly is right here:
 * linking a question to a competency is optional, and the editor says so
 * instead of showing an error for a feature the person cannot use anyway.
 */
async function loadCompetencies() {
  try {
    competencies.value = await competenciesApi.list({ status: 'ACTIVE' })
  } catch {
    competencies.value = []
  }
}

/* ---------------- cycles ---------------- */

function openNewCycle() {
  editingCycleId.value = ''
  cycleDraft.value = emptyCycle()
  subjectPick.value = ''
  cycleModalOpen.value = true
}

async function openEditCycle(cycle) {
  editingCycleId.value = cycle.id
  cycleDraft.value = {
    name: cycle.name,
    description: cycle.description ?? '',
    templateId: cycle.templateId,
    subjects: cycle.subjectIds.map((id) => ({ id, fullName: '' })),
    dueAt: toDateInputValue(cycle.dueAt),
    postToCompetencies: Boolean(cycle.postToCompetencies),
  }
  subjectPick.value = ''
  cycleModalOpen.value = true

  // The cycle payload carries ids, not names. The rater preview is the one
  // endpoint that names them and it is already permitted here, so the chips
  // fill in a moment later rather than the screen showing raw ids.
  try {
    const { subjects } = await review360Api.raters(cycle.id)
    const names = new Map(subjects.map((row) => [row.subjectId, row.fullName]))
    for (const subject of cycleDraft.value.subjects) subject.fullName = names.get(subject.id) ?? subject.fullName
  } catch {
    /* names stay empty; the chips fall back to the id */
  }
}

function addSubject(user) {
  if (!user?.id) return
  if (!cycleDraft.value.subjects.some((subject) => subject.id === user.id)) {
    cycleDraft.value.subjects.push({ id: user.id, fullName: user.fullName })
  }
  subjectPick.value = ''
}

function removeSubject(id) {
  cycleDraft.value.subjects = cycleDraft.value.subjects.filter((subject) => subject.id !== id)
}

async function saveCycle() {
  const draft = cycleDraft.value
  if (!draft.name.trim()) return toast.error(t('review360.nameRequired'))
  if (!draft.templateId) return toast.error(t('review360.templateRequired'))
  if (!draft.subjects.length) return toast.error(t('review360.subjectsRequired'))

  saving.value = true
  try {
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      templateId: draft.templateId,
      subjectIds: draft.subjects.map((subject) => subject.id),
      dueAt: draft.dueAt || null,
      postToCompetencies: draft.postToCompetencies,
    }
    if (editingCycleId.value) await review360Api.updateCycle(editingCycleId.value, payload)
    else await review360Api.createCycle(payload)
    cycleModalOpen.value = false
    toast.success(t('review360.cycleSaved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.saveError')))
  } finally {
    saving.value = false
  }
}

async function removeCycle(cycle) {
  const ok = await confirm.ask({
    title: t('review360.confirmDeleteCycleTitle'),
    message: t('review360.confirmDeleteCycleMessage'),
  })
  if (!ok) return
  try {
    await review360Api.removeCycle(cycle.id)
    toast.success(t('review360.cycleDeleted'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.saveError')))
  }
}

async function openPreview(cycle) {
  previewCycle.value = cycle
  previewOpen.value = true
  previewLoading.value = true
  preview.value = { threshold: cycle.anonymityThreshold ?? 3, subjects: [] }
  try {
    preview.value = await review360Api.raters(cycle.id)
  } catch (error) {
    previewOpen.value = false
    toast.error(apiErrorText(error, t('review360.loadError')))
  } finally {
    previewLoading.value = false
  }
}

async function launch(cycle) {
  const ok = await confirm.ask({
    title: t('review360.confirmLaunchTitle'),
    message: t('review360.confirmLaunchMessage', { count: cycle.subjectCount }),
    confirmLabel: t('review360.launch'),
    danger: false,
  })
  if (!ok) return
  try {
    const launched = await review360Api.launch(cycle.id)
    previewOpen.value = false
    toast.success(t('review360.cycleLaunched', { count: launched.invited ?? 0 }))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.saveError')))
  }
}

async function closeCycle(cycle) {
  const ok = await confirm.ask({
    title: t('review360.confirmCloseTitle'),
    message: t('review360.confirmCloseMessage'),
    confirmLabel: t('review360.closeCycle'),
  })
  if (!ok) return
  try {
    const closed = await review360Api.close(cycle.id)
    toast.success(t('review360.cycleClosed'))
    // Closing may also write competency levels (13.1), and it may write only
    // some of them — a silent partial write is how somebody later concludes
    // the integration is broken, so both halves are said out loud.
    if (closed.competencyLevelsPosted) {
      toast.info(t('review360.levelsPosted', { count: closed.competencyLevelsPosted }))
    }
    if (closed.competencyLevelsSkipped?.length) {
      toast.warning(t('review360.levelsSkipped', { count: closed.competencyLevelsSkipped.length }))
    }
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.saveError')))
  }
}

/* ---------------- templates ---------------- */

function openNewTemplate() {
  editingTemplateId.value = ''
  templateDraft.value = emptyTemplate()
  templateModalOpen.value = true
}

function openEditTemplate(template) {
  editingTemplateId.value = template.id
  templateDraft.value = {
    name: template.name,
    description: template.description ?? '',
    status: template.status,
    raterGroups: [...template.raterGroups],
    maxPeers: template.maxPeers,
    maxSubordinates: template.maxSubordinates,
    anonymousGroups: [...template.anonymousGroups],
    anonymityThreshold: template.anonymityThreshold,
    questions: template.questions.map((question) => ({
      text: question.text,
      type: question.type,
      scaleMax: question.scaleMax,
      required: question.required,
      competencyId: question.competencyId ?? '',
      groups: [...question.groups],
    })),
  }
  templateModalOpen.value = true
}

function toggleIn(list, value) {
  const index = list.indexOf(value)
  if (index === -1) list.push(value)
  else list.splice(index, 1)
}

function addQuestion() {
  templateDraft.value.questions.push({
    text: '',
    type: 'RATING',
    scaleMax: 5,
    required: true,
    competencyId: '',
    groups: [...RATER_GROUPS],
  })
}

async function saveTemplate() {
  const draft = templateDraft.value
  if (!draft.name.trim()) return toast.error(t('review360.nameRequired'))
  if (!draft.questions.length) return toast.error(t('review360.questionsRequired'))
  if (draft.questions.some((question) => !question.text.trim())) {
    return toast.error(t('review360.questionTextRequired'))
  }

  saving.value = true
  try {
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      raterGroups: draft.raterGroups.length ? draft.raterGroups : [...RATER_GROUPS],
      maxPeers: Number(draft.maxPeers) || 0,
      maxSubordinates: Number(draft.maxSubordinates) || 0,
      anonymousGroups: draft.anonymousGroups,
      anonymityThreshold: Number(draft.anonymityThreshold) || 3,
      questions: draft.questions.map((question, index) => ({
        text: question.text.trim(),
        type: question.type,
        required: question.required,
        // Positional, like the competency ladder: the order is the order of
        // the list on screen and there is nothing for a person to decide.
        order: index,
        groups: question.groups.length ? question.groups : [...RATER_GROUPS],
        competencyId: question.competencyId || null,
        // A text question carries no scale — the server refuses the pair,
        // and sending it would fail the whole save on a field the editor
        // has already hidden.
        ...(question.type === 'RATING' ? { scaleMax: Number(question.scaleMax) || 5 } : {}),
      })),
    }
    if (editingTemplateId.value) {
      await review360Api.updateTemplate(editingTemplateId.value, { ...payload, status: draft.status })
    } else {
      // Creation always lands in DRAFT whatever is sent, so the status is
      // not offered until the questionnaire exists.
      await review360Api.createTemplate(payload)
    }
    templateModalOpen.value = false
    toast.success(t('review360.templateSaved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.saveError')))
  } finally {
    saving.value = false
  }
}

async function removeTemplate(template) {
  const ok = await confirm.ask({
    title: t('review360.confirmDeleteTemplateTitle'),
    message: t('review360.confirmDeleteTemplateMessage'),
  })
  if (!ok) return
  try {
    await review360Api.removeTemplate(template.id)
    toast.success(t('review360.templateDeleted'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.saveError')))
  }
}

onMounted(async () => {
  await load()
  await loadCompetencies()
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[28px] font-bold text-ink">{{ t('review360.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('review360.subtitle') }}</p>
      </div>
      <AppButton v-if="canManage" icon="plus" @click="tab === 'cycles' ? openNewCycle() : openNewTemplate()">
        {{ tab === 'cycles' ? t('review360.newCycle') : t('review360.newTemplate') }}
      </AppButton>
    </div>

    <Tabs
      v-model="tab"
      class="mt-5"
      :tabs="[
        { value: 'cycles', label: t('review360.cycles'), count: cycles.length },
        { value: 'templates', label: t('review360.templates'), count: templates.length },
      ]"
    />

    <!-- ------------------------------- cycles ------------------------------- -->
    <template v-if="tab === 'cycles'">
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <AppSelect
          v-model="statusFilter"
          class="w-48"
          :aria-label="t('review360.filterStatus')"
          :options="statusOptions"
          @update:model-value="load"
        />
      </div>

      <div v-if="loading" class="mt-6 space-y-3">
        <Skeleton v-for="n in 4" :key="n" class="h-28 w-full rounded-lg" />
      </div>

      <EmptyState
        v-else-if="!cycles.length"
        class="mt-6"
        icon="refresh"
        :title="t('review360.emptyCycles')"
        :description="t('review360.emptyCyclesHint')"
      />

      <div v-else class="mt-4 space-y-3">
        <AppCard v-for="cycle in cycles" :key="cycle.id" class="p-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate font-medium text-ink">{{ cycle.name }}</p>
                <Badge :variant="statusVariant[cycle.status]" size="sm">
                  {{ t(`review360.status.${cycle.status}`) }}
                </Badge>
                <span class="text-caption text-ink-faint">{{ templateName(cycle.templateId) }}</span>
              </div>

              <p v-if="cycle.description" class="mt-1 line-clamp-2 text-small text-ink-muted">
                {{ cycle.description }}
              </p>

              <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
                <span>
                  <Icon name="users" size="11" class="mr-1 inline" />
                  {{ t('review360.subjectCount', { count: cycle.subjectCount }) }}
                </span>
                <span>
                  <Icon name="clock" size="11" class="mr-1 inline" />
                  {{ cycle.dueAt ? formatDate(cycle.dueAt, locale) : t('review360.noDue') }}
                </span>
                <span v-if="cycle.launchedAt">
                  {{ t('review360.launchedAt') }}: {{ formatDate(cycle.launchedAt, locale) }}
                </span>
                <span v-else>{{ t('review360.notLaunched') }}</span>
                <span v-if="cycle.closedAt">
                  {{ t('review360.closedAt') }}: {{ formatDate(cycle.closedAt, locale) }}
                </span>
              </p>

              <div v-if="cycle.invited" class="mt-3 max-w-md">
                <div class="flex items-center justify-between text-caption text-ink-muted">
                  <span>{{ t('review360.progressOf', { responded: cycle.responded, invited: cycle.invited }) }}</span>
                  <span>{{ percentOf(cycle) }}%</span>
                </div>
                <ProgressBar
                  class="mt-1"
                  size="sm"
                  :value="percentOf(cycle)"
                  :variant="cycle.status === 'CLOSED' ? 'success' : 'primary'"
                />
              </div>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <AppButton variant="secondary" size="sm" icon="bar-chart" @click="openCycle(cycle)">
                {{ t('review360.open') }}
              </AppButton>
              <template v-if="canManage && cycle.status === 'DRAFT'">
                <AppButton variant="secondary" size="sm" icon="eye" @click="openPreview(cycle)">
                  {{ t('review360.preview') }}
                </AppButton>
                <AppButton
                  variant="ghost"
                  size="sm"
                  icon="pencil"
                  :aria-label="t('review360.editCycle')"
                  @click="openEditCycle(cycle)"
                />
                <AppButton
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  :aria-label="t('common.delete')"
                  @click="removeCycle(cycle)"
                />
              </template>
              <AppButton
                v-if="canManage && cycle.status === 'RUNNING'"
                variant="secondary"
                size="sm"
                icon="check"
                @click="closeCycle(cycle)"
              >
                {{ t('review360.closeCycle') }}
              </AppButton>
            </div>
          </div>
        </AppCard>
      </div>
    </template>

    <!-- ----------------------------- templates ----------------------------- -->
    <template v-else>
      <p class="mt-5 text-small text-ink-muted">{{ t('review360.templatesSubtitle') }}</p>

      <div v-if="loading" class="mt-6 space-y-3">
        <Skeleton v-for="n in 3" :key="n" class="h-20 w-full rounded-lg" />
      </div>

      <EmptyState
        v-else-if="!templates.length"
        class="mt-6"
        icon="file-text"
        :title="t('review360.emptyTemplates')"
        :description="t('review360.emptyTemplatesHint')"
      />

      <div v-else class="mt-4 space-y-3">
        <AppCard v-for="template in templates" :key="template.id" class="flex flex-wrap items-start justify-between gap-4 p-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate font-medium text-ink">{{ template.name }}</p>
              <Badge :variant="templateStatusVariant[template.status]" size="sm">
                {{ t(`review360.templateStatus.${template.status}`) }}
              </Badge>
            </div>
            <p v-if="template.description" class="mt-1 line-clamp-2 text-small text-ink-muted">
              {{ template.description }}
            </p>
            <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
              <span>{{ t('review360.questionCount', { count: template.questions.length }) }}</span>
              <span>
                {{ t('review360.raterGroups') }}:
                {{ template.raterGroups.map((group) => t(`review360.group.${group}`)).join(', ') }}
              </span>
              <span>{{ t('review360.anonymityThreshold') }}: {{ template.anonymityThreshold }}</span>
            </p>
          </div>
          <div v-if="canManage" class="flex shrink-0 gap-2">
            <AppButton variant="secondary" size="sm" icon="pencil" @click="openEditTemplate(template)">
              {{ t('common.edit') }}
            </AppButton>
            <AppButton
              variant="ghost"
              size="sm"
              icon="trash"
              :aria-label="t('common.delete')"
              @click="removeTemplate(template)"
            />
          </div>
        </AppCard>
      </div>
    </template>

    <!-- ---------------------------- cycle modal ---------------------------- -->
    <Modal
      v-model="cycleModalOpen"
      size="lg"
      :title="editingCycleId ? t('review360.editCycle') : t('review360.newCycle')"
    >
      <div class="space-y-4">
        <AppInput v-model="cycleDraft.name" :label="t('review360.name')" required />
        <AppInput v-model="cycleDraft.description" :label="t('review360.description')" />

        <div class="grid gap-3 sm:grid-cols-2">
          <AppSelect
            v-model="cycleDraft.templateId"
            :label="t('review360.template')"
            :placeholder="t('review360.chooseTemplate')"
            :options="templateOptions"
          />
          <AppDatePicker v-model="cycleDraft.dueAt" :label="t('review360.dueAt')" :hint="t('review360.dueAtHint')" />
        </div>
        <p class="-mt-2 text-caption text-ink-faint">{{ t('review360.templateHint') }}</p>

        <div class="rounded-lg border border-border p-3">
          <p class="text-small font-medium text-ink">{{ t('review360.subjects') }}</p>
          <p class="text-caption text-ink-faint">{{ t('review360.subjectsHint') }}</p>

          <UserPicker
            v-model="subjectPick"
            class="mt-3"
            :placeholder="t('review360.addSubject')"
            :label="t('review360.addSubject')"
            @select="addSubject"
          />

          <p v-if="!cycleDraft.subjects.length" class="mt-3 text-caption text-ink-faint">
            {{ t('review360.noSubjects') }}
          </p>
          <div v-else class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="subject in cycleDraft.subjects"
              :key="subject.id"
              class="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1.5 text-caption text-ink"
            >
              {{ subject.fullName || subject.id }}
              <button
                type="button"
                class="rounded-full p-1 text-ink-faint transition-default hover:bg-surface hover:text-ink"
                :aria-label="t('review360.removeSubject')"
                @click="removeSubject(subject.id)"
              >
                <Icon name="close" size="12" />
              </button>
            </span>
          </div>
        </div>

        <label class="flex cursor-pointer items-start gap-2">
          <input v-model="cycleDraft.postToCompetencies" type="checkbox" class="mt-0.5 h-4 w-4 cursor-pointer accent-primary" />
          <span>
            <span class="block text-small text-ink">{{ t('review360.postToCompetencies') }}</span>
            <span class="block text-caption text-ink-faint">{{ t('review360.postToCompetenciesHint') }}</span>
          </span>
        </label>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="cycleModalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="saveCycle">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <!-- --------------------------- template modal --------------------------- -->
    <Modal
      v-model="templateModalOpen"
      size="xl"
      :title="editingTemplateId ? t('review360.editTemplate') : t('review360.newTemplate')"
    >
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <AppInput v-model="templateDraft.name" :label="t('review360.name')" required />
          <AppSelect
            v-if="editingTemplateId"
            v-model="templateDraft.status"
            :label="t('review360.filterStatus')"
            :options="templateStatusOptions"
          />
        </div>
        <AppInput v-model="templateDraft.description" :label="t('review360.description')" />

        <div class="rounded-lg border border-border p-3">
          <p class="text-small font-medium text-ink">{{ t('review360.raterGroups') }}</p>
          <p class="text-caption text-ink-faint">{{ t('review360.raterGroupsHint') }}</p>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            <label v-for="group in RATER_GROUPS" :key="group" class="flex cursor-pointer items-center gap-2 text-small text-ink">
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer accent-primary"
                :checked="templateDraft.raterGroups.includes(group)"
                @change="toggleIn(templateDraft.raterGroups, group)"
              />
              {{ t(`review360.group.${group}`) }}
            </label>
          </div>

          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <AppInput
              v-model="templateDraft.maxPeers"
              type="number"
              :label="t('review360.maxPeers')"
              :hint="t('review360.maxPeersHint')"
            />
            <AppInput v-model="templateDraft.maxSubordinates" type="number" :label="t('review360.maxSubordinates')" />
          </div>
        </div>

        <div class="rounded-lg border border-border p-3">
          <p class="text-small font-medium text-ink">{{ t('review360.anonymousGroups') }}</p>
          <p class="text-caption text-ink-faint">{{ t('review360.anonymousGroupsHint') }}</p>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            <label
              v-for="group in RATER_GROUPS"
              :key="group"
              class="flex cursor-pointer items-center gap-2 text-small text-ink"
            >
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer accent-primary"
                :checked="templateDraft.anonymousGroups.includes(group)"
                @change="toggleIn(templateDraft.anonymousGroups, group)"
              />
              {{ t(`review360.group.${group}`) }}
            </label>
          </div>
          <div class="mt-3 max-w-xs">
            <AppInput
              v-model="templateDraft.anonymityThreshold"
              type="number"
              :label="t('review360.anonymityThreshold')"
              :hint="t('review360.anonymityThresholdHint')"
            />
          </div>
        </div>

        <div class="rounded-lg border border-border p-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-small font-medium text-ink">{{ t('review360.questions') }}</p>
              <p class="text-caption text-ink-faint">{{ t('review360.questionsHint') }}</p>
            </div>
            <AppButton variant="ghost" size="sm" icon="plus" @click="addQuestion">
              {{ t('review360.addQuestion') }}
            </AppButton>
          </div>

          <p v-if="!templateDraft.questions.length" class="mt-2 text-caption text-ink-faint">
            {{ t('review360.noQuestions') }}
          </p>

          <div v-else class="mt-3 space-y-3">
            <div v-for="(question, index) in templateDraft.questions" :key="index" class="rounded-md border border-border p-3">
              <div class="flex items-start gap-2">
                <span class="mt-2.5 w-6 shrink-0 text-center text-small text-ink-muted">{{ index + 1 }}</span>
                <AppInput
                  v-model="question.text"
                  class="flex-1"
                  :aria-label="t('review360.questionText')"
                  :placeholder="t('review360.questionText')"
                />
                <AppButton
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  :aria-label="t('review360.removeQuestion')"
                  @click="templateDraft.questions.splice(index, 1)"
                />
              </div>

              <div class="mt-2 grid gap-3 pl-8 sm:grid-cols-3">
                <AppSelect v-model="question.type" :label="t('review360.questionTypeLabel')" :options="questionTypeOptions" />
                <AppInput
                  v-if="question.type === 'RATING'"
                  v-model="question.scaleMax"
                  type="number"
                  :label="t('review360.scaleMax')"
                />
                <div>
                  <AppSelect
                    v-model="question.competencyId"
                    :label="t('review360.competency')"
                    :options="competencyOptions"
                  />
                  <p v-if="!competencies.length" class="mt-1 text-caption text-ink-faint">
                    {{ t('review360.competencyUnavailable') }}
                  </p>
                </div>
              </div>

              <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-8">
                <label class="flex cursor-pointer items-center gap-2 text-small text-ink">
                  <input v-model="question.required" type="checkbox" class="h-4 w-4 cursor-pointer accent-primary" />
                  {{ t('review360.required') }}
                </label>
                <span class="text-caption text-ink-faint">{{ t('review360.askedGroups') }}:</span>
                <label
                  v-for="group in RATER_GROUPS"
                  :key="group"
                  class="flex cursor-pointer items-center gap-2 text-small text-ink"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer accent-primary"
                    :checked="question.groups.includes(group)"
                    @change="toggleIn(question.groups, group)"
                  />
                  {{ t(`review360.group.${group}`) }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="templateModalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="saveTemplate">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <!-- ---------------------------- rater preview ---------------------------- -->
    <Modal
      v-model="previewOpen"
      size="xl"
      :title="t('review360.previewTitle')"
      :description="t('review360.previewSubtitle')"
    >
      <div v-if="previewLoading" class="space-y-2">
        <Skeleton v-for="n in 4" :key="n" class="h-10 w-full rounded-md" />
      </div>

      <div v-else>
        <p class="text-caption text-ink-faint">{{ t('review360.previewThreshold', { n: preview.threshold }) }}</p>

        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-small">
            <thead>
              <tr class="border-b border-border text-left text-caption text-ink-faint">
                <th scope="col" class="py-2 pr-3 font-medium">{{ t('review360.subjects') }}</th>
                <th v-for="group in RATER_GROUPS" :key="group" scope="col" class="px-2 py-2 text-center font-medium">
                  {{ t(`review360.group.${group}`) }}
                </th>
                <th scope="col" class="px-2 py-2 text-center font-medium">{{ t('review360.previewTotal') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in preview.subjects" :key="row.subjectId" class="border-b border-border/60">
                <td class="py-2 pr-3">
                  <span class="text-ink">{{ row.fullName }}</span>
                  <span v-if="row.position" class="ml-1 text-caption text-ink-faint">· {{ row.position }}</span>
                  <Badge v-if="!row.hasManager" class="ml-2" variant="warning" size="sm">
                    {{ t('review360.previewNoManager') }}
                  </Badge>
                  <Badge v-if="row.sealedGroups.length" class="ml-2" variant="warning" size="sm">
                    {{ t('review360.previewSealed') }}:
                    {{ row.sealedGroups.map((group) => t(`review360.group.${group}`)).join(', ') }}
                  </Badge>
                </td>
                <td v-for="group in RATER_GROUPS" :key="group" class="px-2 py-2 text-center text-ink-muted">
                  {{ row.counts[group] }}
                </td>
                <td class="px-2 py-2 text-center font-medium" :class="row.total ? 'text-ink' : 'text-danger'">
                  {{ row.total }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-3 text-caption text-ink-faint">{{ t('review360.previewSealedHint') }}</p>
        <p v-if="preview.subjects.some((row) => !row.total)" class="mt-1 text-caption text-danger">
          {{ t('review360.previewEmpty') }}
        </p>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="previewOpen = false">{{ t('common.close') }}</AppButton>
        <AppButton
          v-if="canManage && previewCycle?.status === 'DRAFT'"
          :disabled="previewLoading"
          icon="send"
          @click="launch(previewCycle)"
        >
          {{ t('review360.launch') }}
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
