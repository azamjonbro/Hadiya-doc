<script setup>
/**
 * Individual development plans (13.4) — the manager's side.
 *
 * Three decisions shape this screen:
 *
 * 1. **The gaps are on the create form, not behind a menu.** A plan written
 *    from memory repeats what the manager already believed;
 *    `GET /development-plans/suggestions/:userId` is the same arithmetic the
 *    competency matrix runs (13.1), with the courses that close each gap
 *    attached. Turning one of those into a goal in one click is the reason
 *    this screen is worth opening.
 *
 * 2. **No percentage box on a derived goal.** The API answers a write to a
 *    COURSE or COMPETENCY goal with GOAL_PROGRESS_DERIVED, and finding that
 *    out through a 400 after typing a number is a worse way to learn it than
 *    never being offered the box. The switch is the server's own
 *    `progressSource`, not a copy of the type list here — a local copy would
 *    drift the day a third derived kind is added.
 *
 * 3. **Credits are confirmed by amount.** Both paths that pay CPE credits —
 *    the explicit button and an approving review, which accrues as a side
 *    effect — name the person and the number before anything is written. The
 *    ledger has no reversal.
 */
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { developmentPlansApi } from '@/services/developmentPlans'
import { competenciesApi } from '@/services/competencies'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import Pagination from '@/components/ui/Pagination.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import UserPicker from '@/components/ui/UserPicker.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()

const canManage = computed(() => auth.hasPermission('devplan:manage'))

const GOAL_TYPES = ['COURSE', 'COMPETENCY', 'OJT', 'CUSTOM']
const GOAL_STATUSES = ['PLANNED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED']
const PLAN_STATUSES = ['DRAFT', 'ACTIVE', 'REVIEWED', 'COMPLETED', 'ARCHIVED']

const tab = ref('all')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const limit = 25
const listLoading = ref(true)
const filterUserId = ref('')
const filterUserName = ref('')
const filterStatus = ref('')

const dueRows = ref([])
const dueWithin = ref('14')
const dueLoading = ref(false)

const plan = ref(null)
const detailLoading = ref(false)
const openReviewId = ref('')

const planModalOpen = ref(false)
const planSaving = ref(false)
const editingPlanId = ref('')
const planDraft = ref(emptyPlanDraft())

const suggestions = ref(null)
const suggestionsLoading = ref(false)

const goalModalOpen = ref(false)
const goalSaving = ref(false)
const goalDraft = ref(emptyGoalDraft())
const goalEditingId = ref('')
// Whether the goal being edited is going into a plan that does not exist yet
// (staged on the create form) or into the plan on screen.
const goalTarget = ref('staged')

const reviewModalOpen = ref(false)
const reviewSaving = ref(false)
const reviewDraft = ref(emptyReviewDraft())

const courseOptions = ref([])
const courseSearch = ref('')
const competencyOptions = ref([])

const commentId = useId()
const goalDescriptionId = `${commentId}-goal-description`

function emptyPlanDraft() {
  return { userId: '', displayName: '', title: '', periodStart: '', periodEnd: '', status: 'DRAFT', goals: [] }
}

function emptyGoalDraft() {
  return {
    type: 'CUSTOM',
    title: '',
    description: '',
    courseId: '',
    competencyId: '',
    targetLevel: '',
    ojtChecklistId: '',
    targetDate: '',
    weight: 1,
    cpeCredits: 0,
    status: 'PLANNED',
    progressPercent: 0,
  }
}

function emptyReviewDraft() {
  return { decision: 'APPROVED', period: '', overallRating: '', comment: '', completePlan: false, goalComments: {} }
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const statusOptions = computed(() => PLAN_STATUSES.map((value) => ({ value, label: t(`devplan.status.${value}`) })))

// Rasn 11's tiles map onto the plan statuses we have: in progress is
// ACTIVE, not started is DRAFT, awaiting a decision is REVIEWED.
const statusTiles = computed(() => [
  { key: 'ACTIVE', label: t('devplan.status.ACTIVE'), active: tab.value === 'all' && filterStatus.value === 'ACTIVE', count: total.value },
  { key: 'DRAFT', label: t('devplan.status.DRAFT'), active: tab.value === 'all' && filterStatus.value === 'DRAFT', count: total.value },
  { key: 'REVIEWED', label: t('devplan.status.REVIEWED'), active: tab.value === 'all' && filterStatus.value === 'REVIEWED', count: total.value },
  { key: 'COMPLETED', label: t('devplan.status.COMPLETED'), active: tab.value === 'all' && filterStatus.value === 'COMPLETED', count: total.value },
  { key: '', label: t('devplan.allPlans'), active: tab.value === 'all' && !filterStatus.value, count: total.value },
  { key: 'due', label: t('devplan.dueSoon'), active: tab.value === 'due', count: dueRows.value.length },
])
function pickTile(tile) {
  if (tile.key === 'due') {
    tab.value = 'due'
    return
  }
  tab.value = 'all'
  filterStatus.value = tile.key
}
const goalTypeOptions = computed(() => GOAL_TYPES.map((value) => ({ value, label: t(`devplan.type.${value}`) })))
const goalStatusOptions = computed(() =>
  GOAL_STATUSES.map((value) => ({ value, label: t(`devplan.goalStatus.${value}`) }))
)
const withinOptions = computed(() =>
  ['7', '14', '30', '60'].map((value) => ({ value, label: t('devplan.withinDays', { n: value }) }))
)
const ratingOptions = computed(() => [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) })))
const tabs = computed(() => [
  { value: 'all', label: t('devplan.allPlans'), count: total.value },
  { value: 'due', label: t('devplan.dueSoon'), count: dueRows.value.length },
])

const planStatusVariant = {
  DRAFT: 'neutral',
  ACTIVE: 'info',
  REVIEWED: 'primary',
  COMPLETED: 'success',
  ARCHIVED: 'neutral',
}
const goalStatusVariant = { PLANNED: 'neutral', IN_PROGRESS: 'info', ACHIEVED: 'success', DROPPED: 'neutral' }

/**
 * What an approval would actually pay out.
 *
 * `courseId` is part of the test, not an oversight: CPE credits ride on
 * PointsLedger, which requires a course to attribute a row to, so the
 * service skips an achieved goal that has none. Counting it here would make
 * the confirm dialog promise credits nobody receives.
 */
const pendingCredits = computed(() => {
  if (!plan.value) return 0
  return plan.value.goals
    .filter((goal) => goal.cpeCredits && !goal.cpeCreditedAt && goal.status === 'ACHIEVED' && goal.courseId)
    .reduce((sum, goal) => sum + goal.cpeCredits, 0)
})

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(locale.value, { year: 'numeric', month: 'short', day: 'numeric' })
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : ''
}

function progressVariant(percent) {
  if (percent >= 100) return 'success'
  if (percent > 0) return 'primary'
  return 'warning'
}

/** What a list row can honestly show — see the template for why. */
function achievedPercent(row) {
  return row.goalCount ? Math.round((row.plannedAchieved / row.goalCount) * 100) : 0
}

async function loadList() {
  listLoading.value = true
  try {
    const params = { page: page.value, limit }
    if (filterStatus.value) params.status = filterStatus.value
    if (filterUserId.value) params.userId = filterUserId.value
    const data = await developmentPlansApi.list(params)
    rows.value = data.items
    total.value = data.total
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.loadError')))
  } finally {
    listLoading.value = false
  }
}

async function loadDue() {
  dueLoading.value = true
  try {
    dueRows.value = await developmentPlansApi.due({ withinDays: Number(dueWithin.value) })
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.loadError')))
  } finally {
    dueLoading.value = false
  }
}

async function openPlan(id) {
  detailLoading.value = true
  openReviewId.value = ''
  try {
    plan.value = await developmentPlansApi.get(id)
  } catch (error) {
    plan.value = null
    toast.error(apiErrorText(error, t('devplan.loadError')))
  } finally {
    detailLoading.value = false
  }
}

async function refreshDetail() {
  if (!plan.value) return
  plan.value = await developmentPlansApi.get(plan.value.id)
}

// ---- the plan itself -------------------------------------------------

function openNewPlan() {
  editingPlanId.value = ''
  planDraft.value = emptyPlanDraft()
  suggestions.value = null
  planModalOpen.value = true
}

function openEditPlan() {
  editingPlanId.value = plan.value.id
  planDraft.value = {
    userId: plan.value.userId,
    displayName: '',
    title: plan.value.title,
    periodStart: toDateInput(plan.value.periodStart),
    periodEnd: toDateInput(plan.value.periodEnd),
    status: plan.value.status,
    goals: [],
  }
  suggestions.value = null
  planModalOpen.value = true
}

async function onEmployeePicked(user) {
  planDraft.value.userId = user.id
  planDraft.value.displayName = user.fullName
  suggestionsLoading.value = true
  suggestions.value = null
  try {
    suggestions.value = await developmentPlansApi.suggestions(user.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.loadError')))
  } finally {
    suggestionsLoading.value = false
  }
}

function onEmployeeCleared() {
  planDraft.value.userId = ''
  planDraft.value.displayName = ''
  suggestions.value = null
}

/** A gap becomes a competency goal aimed at the level the job asks for. */
function stageGapGoal(item) {
  planDraft.value.goals.push({
    type: 'COMPETENCY',
    title: item.name,
    competencyId: item.competencyId,
    targetLevel: item.requiredLevel,
    weight: 1,
    cpeCredits: 0,
  })
}

/** And the course the competency nominates becomes a course goal. */
function stageCourseGoal(item, course) {
  planDraft.value.goals.push({
    type: 'COURSE',
    title: course.title || item.name,
    courseId: course.id,
    weight: 1,
    cpeCredits: 0,
  })
}

function isStaged(predicate) {
  return planDraft.value.goals.some(predicate)
}

function planPayloadFrom(draft) {
  const payload = {
    title: draft.title.trim(),
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    status: draft.status,
  }
  if (!editingPlanId.value) {
    payload.userId = draft.userId
    // DRAFT and ACTIVE are the only states a plan may be created in; the
    // rest are reached by reviewing it.
    payload.status = draft.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT'
    payload.goals = draft.goals
  }
  return payload
}

async function savePlan() {
  const draft = planDraft.value
  if (!draft.title.trim() || !draft.periodStart || !draft.periodEnd) {
    toast.error(t('devplan.requiredFields'))
    return
  }
  if (!editingPlanId.value && !draft.userId) {
    toast.error(t('devplan.selectEmployee'))
    return
  }
  planSaving.value = true
  try {
    const payload = planPayloadFrom(draft)
    const saved = editingPlanId.value
      ? await developmentPlansApi.update(editingPlanId.value, payload)
      : await developmentPlansApi.create(payload)
    planModalOpen.value = false
    toast.success(t('devplan.saved'))
    await loadList()
    await openPlan(saved.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.saveError')))
  } finally {
    planSaving.value = false
  }
}

async function deletePlan() {
  if (!(await confirm.ask({ title: t('devplan.deletePlan'), message: t('devplan.deletePlanConfirm') }))) return
  try {
    await developmentPlansApi.remove(plan.value.id)
    plan.value = null
    toast.success(t('devplan.removed'))
    await loadList()
  } catch (error) {
    // A reviewed plan cannot be deleted, and the server says to archive it
    // instead — that sentence is the useful one, so it is shown.
    toast.error(apiErrorText(error, t('devplan.saveError')))
  }
}

// ---- goals -----------------------------------------------------------

async function loadGoalPickers() {
  if (!competencyOptions.value.length) {
    competencyOptions.value = await competenciesApi
      .list({ status: 'ACTIVE' })
      .then((items) => items.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })))
      .catch(() => [])
  }
  await searchCourses()
}

async function searchCourses() {
  const params = { status: 'PUBLISHED', limit: 50 }
  if (courseSearch.value.trim()) params.search = courseSearch.value.trim()
  courseOptions.value = await coursesApi
    .list(params)
    .then((data) => data.items.map((course) => ({ value: course.id, label: course.title })))
    .catch(() => [])
}

let courseSearchTimer = null
watch(courseSearch, () => {
  clearTimeout(courseSearchTimer)
  courseSearchTimer = setTimeout(searchCourses, 300)
})

function openNewGoal(target) {
  goalTarget.value = target
  goalEditingId.value = ''
  goalDraft.value = emptyGoalDraft()
  // One dialog at a time. Two open Modals mean two focus traps, and each
  // pulls focus back into its own panel the moment the other takes it — the
  // create form steps aside and the watcher below brings it back with the
  // draft intact.
  if (target === 'staged') planModalOpen.value = false
  goalModalOpen.value = true
  loadGoalPickers()
}

watch(goalModalOpen, (open) => {
  if (!open && goalTarget.value === 'staged') planModalOpen.value = true
})

function openEditGoal(goal) {
  goalTarget.value = 'plan'
  goalEditingId.value = goal.id
  goalDraft.value = {
    type: goal.type,
    title: goal.title,
    description: goal.description ?? '',
    courseId: goal.courseId ?? '',
    competencyId: goal.competencyId ?? '',
    targetLevel: goal.targetLevel ?? '',
    ojtChecklistId: goal.ojtChecklistId ?? '',
    targetDate: toDateInput(goal.targetDate),
    weight: goal.weight ?? 1,
    cpeCredits: goal.cpeCredits ?? 0,
    status: goal.status,
    progressPercent: goal.progressPercent ?? 0,
  }
  goalModalOpen.value = true
  loadGoalPickers()
}

/**
 * Empty optional fields are dropped rather than sent as ''. The validator
 * reads courseId as an ObjectId and targetDate through `coerce.date()`, so
 * an empty string is a 400 on a field the person deliberately left blank.
 */
function goalPayloadFrom(draft) {
  const payload = { type: draft.type, title: draft.title.trim(), weight: Number(draft.weight) || 1 }
  if (draft.description.trim()) payload.description = draft.description.trim()
  if (draft.type === 'COURSE') payload.courseId = draft.courseId
  if (draft.type === 'COMPETENCY') {
    payload.competencyId = draft.competencyId
    if (draft.targetLevel !== '' && draft.targetLevel !== null) payload.targetLevel = Number(draft.targetLevel)
  }
  if (draft.type === 'OJT' && draft.ojtChecklistId.trim()) payload.ojtChecklistId = draft.ojtChecklistId.trim()
  if (draft.targetDate) payload.targetDate = draft.targetDate
  if (Number(draft.cpeCredits) > 0) payload.cpeCredits = Number(draft.cpeCredits)
  payload.status = draft.status
  return payload
}

function validateGoal(draft) {
  if (!draft.title.trim()) return t('devplan.goalTitleRequired')
  if (draft.type === 'COURSE' && !draft.courseId) return t('devplan.goalNeedsCourse')
  if (draft.type === 'COMPETENCY' && !draft.competencyId) return t('devplan.goalNeedsCompetency')
  return ''
}

async function saveGoal() {
  const problem = validateGoal(goalDraft.value)
  if (problem) {
    toast.error(problem)
    return
  }
  const payload = goalPayloadFrom(goalDraft.value)

  if (goalTarget.value === 'staged') {
    planDraft.value.goals.push(payload)
    goalModalOpen.value = false
    return
  }

  goalSaving.value = true
  try {
    if (goalEditingId.value) {
      // `type`, `courseId` and `competencyId` are not in the update schema:
      // changing what a goal points at would leave it reading its progress
      // off the wrong record, so the form shows them locked.
      const { type, courseId, competencyId, ...editable } = payload
      await developmentPlansApi.updateGoal(plan.value.id, goalEditingId.value, editable)
      // A manual goal's percentage has its own endpoint — `updateGoal` does
      // not accept one, and this is the only kind the API will move at all.
      if (isManualType(goalDraft.value.type)) {
        await developmentPlansApi.setGoalProgress(plan.value.id, goalEditingId.value, {
          progressPercent: Number(goalDraft.value.progressPercent) || 0,
        })
      }
    } else {
      await developmentPlansApi.addGoal(plan.value.id, payload)
    }
    goalModalOpen.value = false
    toast.success(t('devplan.saved'))
    await refreshDetail()
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.saveError')))
  } finally {
    goalSaving.value = false
  }
}

// The client-side twin of the server's DERIVED_GOAL_TYPES, needed only for a
// goal that has not been saved yet and therefore has no `progressSource` on
// it. Anything already stored is judged by the server's own field.
function isManualType(type) {
  return type === 'OJT' || type === 'CUSTOM'
}

async function removeGoal(goal) {
  if (!(await confirm.ask({ title: t('devplan.removeGoal'), message: t('devplan.removeGoalConfirm') }))) return
  try {
    await developmentPlansApi.removeGoal(plan.value.id, goal.id)
    toast.success(t('devplan.removed'))
    await refreshDetail()
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.saveError')))
  }
}

// ---- review and credits ---------------------------------------------

function openReview() {
  reviewDraft.value = emptyReviewDraft()
  reviewModalOpen.value = true
}

async function submitReview() {
  const draft = reviewDraft.value
  const name = plan.value.fullName || planOwnerName.value
  if (draft.decision === 'APPROVED') {
    const message = pendingCredits.value
      ? t('devplan.approveWithCredits', { name, n: pendingCredits.value })
      : t('devplan.approveNoCredits', { name, n: plan.value.version })
    if (!(await confirm.ask({ title: t('devplan.approveConfirmTitle'), message, danger: false }))) return
  }

  const payload = { decision: draft.decision }
  if (draft.period.trim()) payload.period = draft.period.trim()
  if (draft.overallRating) payload.overallRating = Number(draft.overallRating)
  if (draft.comment.trim()) payload.comment = draft.comment.trim()
  if (draft.completePlan) payload.completePlan = true
  const goalComments = Object.entries(draft.goalComments)
    .filter(([, comment]) => comment.trim())
    .map(([goalId, comment]) => ({ goalId, comment: comment.trim() }))
  if (goalComments.length) payload.goalComments = goalComments

  reviewSaving.value = true
  try {
    const result = await developmentPlansApi.review(plan.value.id, payload)
    reviewModalOpen.value = false
    toast.success(t('devplan.reviewSaved'))
    if (result.credited?.totalCredits) {
      toast.info(t('devplan.creditsAwarded', { n: result.credited.totalCredits }))
    }
    await Promise.all([refreshDetail(), loadList()])
    if (tab.value === 'due') await loadDue()
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.saveError')))
  } finally {
    reviewSaving.value = false
  }
}

async function payCredits() {
  if (!pendingCredits.value) {
    toast.info(t('devplan.noCreditsPending'))
    return
  }
  const message = t('devplan.payCreditsConfirm', {
    name: plan.value.fullName || planOwnerName.value,
    n: pendingCredits.value,
  })
  if (!(await confirm.ask({ title: t('devplan.payCreditsTitle'), message, danger: false }))) return
  try {
    const result = await developmentPlansApi.accrue(plan.value.id)
    toast.success(t('devplan.creditsAwarded', { n: result.totalCredits }))
    await refreshDetail()
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.saveError')))
  }
}

// The detail payload carries the owner's id but not their name; the list row
// the plan was opened from does.
const planOwnerName = computed(() => {
  if (!plan.value) return ''
  const row =
    rows.value.find((entry) => entry.id === plan.value.id) ||
    dueRows.value.find((entry) => entry.id === plan.value.id)
  return row?.fullName ?? ''
})

watch(page, loadList)
watch([filterStatus, filterUserId], () => {
  // Leaving the reload to the page watcher when the page actually moves;
  // doing both fires two identical requests for one filter change.
  if (page.value !== 1) page.value = 1
  else loadList()
})
watch(tab, (value) => {
  if (value === 'due' && !dueRows.value.length) loadDue()
})
watch(dueWithin, loadDue)

onMounted(() => {
  loadList()
  loadDue()
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('devplan.adminTitle') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('devplan.adminSubtitle') }}</p>
      </div>
      <AppButton v-if="canManage" icon="plus" @click="openNewPlan">{{ t('devplan.newPlan') }}</AppButton>
    </div>

    <!-- Rasn 11: the status strip — each tile is a filter; the count on
         the lit one is the server's total for it. The "due soon" view
         keeps its own tile at the end. -->
    <div class="mt-5 rounded-xl border border-border p-2">
      <div class="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <button
          v-for="tile in statusTiles"
          :key="tile.key"
          type="button"
          class="rounded-lg px-4 py-3 text-left transition-default"
          :class="tile.active ? 'bg-surface-2 shadow-[inset_3px_0_0_0_rgb(var(--color-primary))]' : 'hover:bg-surface-2'"
          @click="pickTile(tile)"
        >
          <p class="text-[14px] text-ink-muted">{{ tile.label }}</p>
          <p class="mt-1 text-[24px] font-semibold text-ink">{{ tile.active ? tile.count : '·' }}</p>
        </button>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-end gap-3">
      <template v-if="tab === 'all'">
        <UserPicker
          v-model="filterUserId"
          class="w-64"
          :display-name="filterUserName"
          :label="t('devplan.employee')"
          :placeholder="t('devplan.selectEmployee')"
          @select="filterUserName = $event.fullName"
          @clear="filterUserName = ''"
        />
        <AppSelect
          v-model="filterStatus"
          class="w-48"
          :label="t('devplan.planStatus')"
          :placeholder="t('common.all')"
          :options="statusOptions"
        />
      </template>
      <AppSelect
        v-else
        v-model="dueWithin"
        class="w-56"
        :label="t('devplan.dueSoon')"
        :options="withinOptions"
      />
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <!-- The list -->
      <div>
        <div v-if="tab === 'all' ? listLoading : dueLoading" class="space-y-3">
          <Skeleton v-for="n in 5" :key="n" class="h-24 w-full rounded-lg" />
        </div>

        <EmptyState
          v-else-if="tab === 'all' && !rows.length"
          icon="list"
          :title="t('devplan.noPlans')"
          :description="t('devplan.noPlansHint')"
        />
        <EmptyState
          v-else-if="tab === 'due' && !dueRows.length"
          icon="clock"
          :title="t('devplan.dueEmpty')"
          :description="t('devplan.dueEmptyHint')"
        />

        <div v-else class="space-y-3">
          <template v-if="tab === 'all'">
            <AppCard
              v-for="row in rows"
              :key="row.id"
              as="button"
              type="button"
              padding="sm"
              class="w-full text-left"
              :class="plan && plan.id === row.id ? 'border-primary ring-1 ring-primary/25' : 'hover:border-border-strong'"
              :aria-current="plan && plan.id === row.id ? 'true' : undefined"
              :aria-label="t('devplan.openPlan') + ': ' + row.fullName + ' — ' + row.title"
              @click="openPlan(row.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="min-w-0 flex-1 truncate font-medium text-ink">{{ row.fullName }}</p>
                <Badge :variant="planStatusVariant[row.status]" size="sm">
                  {{ t(`devplan.status.${row.status}`) }}
                </Badge>
              </div>
              <p class="mt-0.5 truncate text-small text-ink-muted">{{ row.title }}</p>
              <p class="mt-1 text-caption text-ink-faint">
                {{ formatDate(row.periodStart) }} — {{ formatDate(row.periodEnd) }}
              </p>
              <!-- Goals achieved, not the weighted figure: the list endpoint
                   deliberately does not derive progress per row, and inventing
                   a percentage here would disagree with the plan itself. -->
              <div class="mt-2">
                <ProgressBar size="sm" :value="achievedPercent(row)" :variant="progressVariant(achievedPercent(row))" />
                <p class="mt-1 text-caption text-ink-faint">
                  {{ t('devplan.achievedOf', { achieved: row.plannedAchieved, total: row.goalCount }) }}
                </p>
              </div>
            </AppCard>
            <Pagination v-if="totalPages > 1" :page="page" :total-pages="totalPages" @update:page="page = $event" />
          </template>

          <template v-else>
            <AppCard
              v-for="row in dueRows"
              :key="row.id"
              as="button"
              type="button"
              padding="sm"
              class="w-full text-left"
              :class="plan && plan.id === row.id ? 'border-primary ring-1 ring-primary/25' : 'hover:border-border-strong'"
              :aria-current="plan && plan.id === row.id ? 'true' : undefined"
              :aria-label="t('devplan.openPlan') + ': ' + row.fullName + ' — ' + row.title"
              @click="openPlan(row.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="min-w-0 flex-1 truncate font-medium text-ink">{{ row.fullName }}</p>
                <Badge variant="warning" size="sm">{{ t('devplan.dueSoon') }}</Badge>
              </div>
              <p class="mt-0.5 truncate text-small text-ink-muted">{{ row.title }}</p>
              <p class="mt-1 text-caption text-ink-faint">
                {{ t('devplan.periodEnd') }}: {{ formatDate(row.periodEnd) }}
              </p>
            </AppCard>
          </template>
        </div>
      </div>

      <!-- The plan -->
      <div>
        <div v-if="detailLoading" class="space-y-3">
          <Skeleton class="h-32 w-full rounded-lg" />
          <Skeleton v-for="n in 3" :key="n" class="h-24 w-full rounded-lg" />
        </div>

        <EmptyState
          v-else-if="!plan"
          icon="file-text"
          :title="t('devplan.title')"
          :description="t('devplan.selectPlan')"
        />

        <div v-else class="space-y-4">
          <AppCard class="p-5">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-h3 text-ink">{{ plan.title }}</h2>
                  <Badge :variant="planStatusVariant[plan.status]" size="sm">
                    {{ t(`devplan.status.${plan.status}`) }}
                  </Badge>
                  <Badge variant="neutral" size="sm">{{ t('devplan.version', { n: plan.version }) }}</Badge>
                  <Badge v-if="plan.lockedVersion" variant="primary" size="sm">
                    {{ t('devplan.lockedVersion', { n: plan.lockedVersion }) }}
                  </Badge>
                </div>
                <p v-if="planOwnerName" class="mt-1 text-small text-ink-muted">
                  {{ t('devplan.employee') }}: {{ planOwnerName }}
                </p>
                <p class="mt-1 text-small text-ink-muted">
                  {{ t('devplan.period') }}: {{ formatDate(plan.periodStart) }} — {{ formatDate(plan.periodEnd) }}
                </p>
                <p class="mt-1 text-caption text-ink-faint">
                  {{ t('devplan.lastReview') }}:
                  {{ plan.lastReviewAt ? formatDate(plan.lastReviewAt) : t('devplan.never') }} ·
                  {{ t('devplan.goalCount', { count: plan.goalCount }) }}
                </p>
              </div>

              <div class="flex items-center gap-4">
                <div class="relative shrink-0">
                  <ProgressRing :value="plan.progressPercent" :size="88" :variant="progressVariant(plan.progressPercent)" />
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-h3 text-ink">{{ plan.progressPercent }}%</span>
                    <span class="text-caption text-ink-faint">{{ t('devplan.overall') }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="canManage" class="mt-4 flex flex-wrap gap-2">
              <AppButton size="sm" icon="check-circle" @click="openReview">{{ t('devplan.review') }}</AppButton>
              <AppButton
                variant="secondary"
                size="sm"
                icon="award"
                :disabled="!pendingCredits"
                @click="payCredits"
              >
                {{ t('devplan.payCredits') }}
                <span v-if="pendingCredits">&nbsp;· {{ pendingCredits }}</span>
              </AppButton>
              <AppButton variant="secondary" size="sm" icon="plus" @click="openNewGoal('plan')">
                {{ t('devplan.addGoal') }}
              </AppButton>
              <AppButton variant="ghost" size="sm" icon="pencil" @click="openEditPlan">
                {{ t('devplan.editPlan') }}
              </AppButton>
              <AppButton
                variant="ghost"
                size="sm"
                icon="trash"
                :aria-label="t('devplan.deletePlan')"
                @click="deletePlan"
              />
            </div>
          </AppCard>

          <!-- Goals -->
          <div>
            <h3 class="text-small font-medium text-ink">{{ t('devplan.goals') }}</h3>
            <p v-if="!plan.goals.length" class="mt-2 text-small text-ink-faint">{{ t('devplan.noGoals') }}</p>

            <div class="mt-2 space-y-3">
              <AppCard v-for="goal in plan.goals" :key="goal.id" padding="sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge variant="info" size="sm">{{ t(`devplan.type.${goal.type}`) }}</Badge>
                      <p class="min-w-0 truncate font-medium text-ink">{{ goal.title }}</p>
                      <Badge :variant="goalStatusVariant[goal.status]" size="sm">
                        {{ t(`devplan.goalStatus.${goal.status}`) }}
                      </Badge>
                      <Badge v-if="goal.overdue" variant="danger" size="sm">{{ t('devplan.overdue') }}</Badge>
                    </div>

                    <p v-if="goal.description" class="mt-1 text-small text-ink-muted">{{ goal.description }}</p>

                    <div class="mt-2 flex items-center gap-3">
                      <ProgressBar class="flex-1" :value="goal.progressPercent" :variant="progressVariant(goal.progressPercent)" />
                      <span class="w-10 shrink-0 text-right text-small text-ink-muted">{{ goal.progressPercent }}%</span>
                    </div>

                    <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
                      <span :title="goal.progressSource === 'DERIVED' ? t('devplan.derivedHint') : t('devplan.manualHint')">
                        <Icon :name="goal.progressSource === 'DERIVED' ? 'refresh' : 'pencil'" size="11" class="mr-1 inline" />
                        {{ goal.progressSource === 'DERIVED' ? t('devplan.derived') : t('devplan.manual') }}
                      </span>
                      <span v-if="goal.type === 'COMPETENCY' && goal.targetLevel">
                        {{ t('devplan.levelOf', { current: goal.currentLevel ?? 0, target: goal.targetLevel }) }}
                      </span>
                      <span v-if="goal.targetDate">{{ t('devplan.targetDate') }}: {{ formatDate(goal.targetDate) }}</span>
                      <span>{{ t('devplan.weight') }}: {{ goal.weight }}</span>
                      <span v-if="goal.cpeCredits">
                        {{ t('devplan.cpe') }}: {{ goal.cpeCredits }}
                        <template v-if="goal.cpeCreditedAt">· {{ t('devplan.cpeCredited') }}</template>
                      </span>
                    </p>
                  </div>

                  <div v-if="canManage" class="flex shrink-0 gap-1">
                    <AppButton
                      variant="ghost"
                      size="sm"
                      icon="pencil"
                      :aria-label="t('devplan.editGoal')"
                      @click="openEditGoal(goal)"
                    />
                    <AppButton
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      :aria-label="t('devplan.removeGoal')"
                      @click="removeGoal(goal)"
                    />
                  </div>
                </div>
              </AppCard>
            </div>
          </div>

          <!-- Review history -->
          <div>
            <h3 class="text-small font-medium text-ink">{{ t('devplan.reviewHistory') }}</h3>
            <p v-if="!plan.reviews.length" class="mt-2 text-small text-ink-faint">{{ t('devplan.noReviews') }}</p>

            <div class="mt-2 space-y-3">
              <AppCard v-for="review in plan.reviews" :key="review.id" padding="sm">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge :variant="review.decision === 'APPROVED' ? 'success' : 'warning'" size="sm">
                      {{ t(`devplan.decisionValue.${review.decision}`) }}
                    </Badge>
                    <span class="text-small text-ink">{{ review.reviewerName }}</span>
                    <span class="text-caption text-ink-faint">{{ formatDate(review.reviewedAt) }}</span>
                    <Badge variant="neutral" size="sm">{{ t('devplan.version', { n: review.planVersion }) }}</Badge>
                  </div>
                  <span class="text-caption text-ink-faint">
                    {{ t('devplan.progress') }}: {{ review.progressPercent }}% ·
                    {{ review.overallRating ? t('devplan.rating') + ': ' + review.overallRating : t('devplan.noRating') }}
                    <template v-if="review.cpeCreditsAwarded">
                      · {{ t('devplan.creditsAwarded', { n: review.cpeCreditsAwarded }) }}
                    </template>
                  </span>
                </div>

                <p v-if="review.period" class="mt-1 text-caption text-ink-faint">
                  {{ t('devplan.period') }}: {{ review.period }}
                </p>
                <p v-if="review.comment" class="mt-1.5 whitespace-pre-line text-small text-ink-muted">
                  {{ review.comment }}
                </p>

                <ul v-if="review.goalComments.length" class="mt-2 space-y-1">
                  <li v-for="entry in review.goalComments" :key="entry.goalId" class="text-caption text-ink-muted">
                    <Icon name="message-square" size="11" class="mr-1 inline" />
                    {{ entry.comment }} ({{ entry.progressPercent }}%)
                  </li>
                </ul>

                <button
                  v-if="review.snapshot.length"
                  type="button"
                  class="mt-2 rounded text-caption text-primary hover:underline"
                  :aria-expanded="openReviewId === review.id"
                  @click="openReviewId = openReviewId === review.id ? '' : review.id"
                >
                  {{ openReviewId === review.id ? t('devplan.hideSnapshot') : t('devplan.showSnapshot') }}
                </button>

                <div v-if="openReviewId === review.id" class="mt-2 rounded-md border border-border bg-surface-2 p-3">
                  <p class="text-caption text-ink-faint">{{ t('devplan.snapshotNote') }}</p>
                  <ul class="mt-1.5 space-y-1">
                    <li
                      v-for="entry in review.snapshot"
                      :key="entry.id"
                      class="flex items-center justify-between gap-3 text-caption text-ink-muted"
                    >
                      <span class="min-w-0 truncate">{{ entry.title }}</span>
                      <span class="shrink-0">{{ entry.progressPercent }}%</span>
                    </li>
                  </ul>
                </div>
              </AppCard>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / edit the plan -->
    <Modal v-model="planModalOpen" size="lg" :title="editingPlanId ? t('devplan.editPlan') : t('devplan.newPlan')">
      <div class="space-y-4">
        <UserPicker
          v-if="!editingPlanId"
          v-model="planDraft.userId"
          :display-name="planDraft.displayName"
          :label="t('devplan.employee')"
          :placeholder="t('devplan.selectEmployee')"
          @select="onEmployeePicked"
          @clear="onEmployeeCleared"
        />

        <AppInput
          v-model="planDraft.title"
          :label="t('devplan.planTitle')"
          :placeholder="t('devplan.titlePlaceholder')"
          required
        />

        <div class="grid gap-3 sm:grid-cols-3">
          <AppDatePicker v-model="planDraft.periodStart" :label="t('devplan.periodStart')" required />
          <AppDatePicker v-model="planDraft.periodEnd" :label="t('devplan.periodEnd')" required />
          <AppSelect
            v-model="planDraft.status"
            :label="t('devplan.planStatus')"
            :options="editingPlanId ? statusOptions : statusOptions.filter((option) => ['DRAFT', 'ACTIVE'].includes(option.value))"
          />
        </div>

        <!-- The gaps. This is why the screen is worth opening, so it sits in
             the flow of writing the plan rather than behind a second click. -->
        <template v-if="!editingPlanId">
          <div class="rounded-lg border border-border p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-small font-medium text-ink">{{ t('devplan.gaps') }}</p>
                <p class="text-caption text-ink-faint">{{ t('devplan.gapsHint') }}</p>
              </div>
              <Badge v-if="suggestions" variant="info" size="sm">
                {{ t('devplan.fit') }}: {{ suggestions.fitPercent }}%
              </Badge>
            </div>

            <div v-if="suggestionsLoading" class="mt-3 space-y-2">
              <Skeleton v-for="n in 3" :key="n" class="h-14 w-full rounded-md" />
            </div>
            <p v-else-if="!planDraft.userId" class="mt-3 text-caption text-ink-faint">
              {{ t('devplan.pickEmployeeFirst') }}
            </p>
            <p v-else-if="suggestions && !suggestions.items.length" class="mt-3 text-caption text-ink-faint">
              {{ t('devplan.noGaps') }}
            </p>

            <ul v-else-if="suggestions" class="mt-3 space-y-2">
              <li v-for="item in suggestions.items" :key="item.competencyId" class="rounded-md border border-border p-2.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-small font-medium text-ink">{{ item.name }}</p>
                    <p class="text-caption text-ink-faint">
                      {{ item.code }} · {{ t('devplan.gapLevel', { current: item.currentLevel, required: item.requiredLevel }) }}
                    </p>
                  </div>
                  <AppButton
                    v-if="!isStaged((goal) => goal.competencyId === item.competencyId)"
                    variant="secondary"
                    size="sm"
                    icon="plus"
                    @click="stageGapGoal(item)"
                  >
                    {{ t('devplan.addAsGoal') }}
                  </AppButton>
                  <Badge v-else variant="success" size="sm">{{ t('devplan.added') }}</Badge>
                </div>

                <div v-if="item.courses.length" class="mt-2 flex flex-wrap gap-1.5">
                  <AppButton
                    v-for="course in item.courses"
                    :key="course.id"
                    variant="ghost"
                    size="sm"
                    icon="book-open"
                    :disabled="isStaged((goal) => goal.courseId === course.id)"
                    :aria-label="t('devplan.addCourseGoal') + ': ' + course.title"
                    @click="stageCourseGoal(item, course)"
                  >
                    {{ course.title }}
                  </AppButton>
                </div>
              </li>
            </ul>
          </div>

          <!-- Staged goals -->
          <div class="rounded-lg border border-border p-3">
            <div class="flex items-center justify-between">
              <p class="text-small font-medium text-ink">{{ t('devplan.stagedGoals') }}</p>
              <AppButton variant="ghost" size="sm" icon="plus" @click="openNewGoal('staged')">
                {{ t('devplan.customGoal') }}
              </AppButton>
            </div>
            <p v-if="!planDraft.goals.length" class="mt-2 text-caption text-ink-faint">
              {{ t('devplan.noStagedGoals') }}
            </p>
            <ul v-else class="mt-2 space-y-1.5">
              <li
                v-for="(goal, index) in planDraft.goals"
                :key="index"
                class="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <Badge variant="info" size="sm">{{ t(`devplan.type.${goal.type}`) }}</Badge>
                  <span class="truncate text-small text-ink">{{ goal.title }}</span>
                </span>
                <AppButton
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  :aria-label="t('devplan.removeGoal')"
                  @click="planDraft.goals.splice(index, 1)"
                />
              </li>
            </ul>
          </div>
        </template>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="planModalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="planSaving" @click="savePlan">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <!-- Add / edit a goal -->
    <Modal v-model="goalModalOpen" size="lg" :title="goalEditingId ? t('devplan.editGoal') : t('devplan.addGoal')">
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <AppSelect
            v-if="!goalEditingId"
            v-model="goalDraft.type"
            :label="t('devplan.goalType')"
            :options="goalTypeOptions"
          />
          <!-- Shown rather than disabled: the kind and the record a goal
               points at are absent from the update schema on purpose, so
               offering them greyed out would only invite the question. -->
          <div v-else>
            <p class="mb-1.5 text-small font-medium text-ink">{{ t('devplan.goalType') }}</p>
            <Badge variant="info" size="sm">{{ t(`devplan.type.${goalDraft.type}`) }}</Badge>
            <p class="mt-1.5 text-caption text-ink-faint">{{ t('devplan.targetLocked') }}</p>
          </div>
          <AppSelect v-model="goalDraft.status" :label="t('devplan.goalStatusLabel')" :options="goalStatusOptions" />
        </div>

        <AppInput v-model="goalDraft.title" :label="t('devplan.goalTitle')" required />

        <div>
          <label :for="goalDescriptionId" class="mb-1.5 block text-small font-medium text-ink">
            {{ t('devplan.goalDescription') }}
          </label>
          <textarea
            :id="goalDescriptionId"
            v-model="goalDraft.description"
            rows="2"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <!-- The catalogue is 50 rows deep at a time, so a big catalogue stays
             reachable by name rather than by scrolling. -->
        <template v-if="goalDraft.type === 'COURSE' && !goalEditingId">
          <AppInput
            v-model="courseSearch"
            icon="search"
            :aria-label="t('devplan.courseSearch')"
            :placeholder="t('devplan.courseSearch')"
          />
          <AppSelect
            v-model="goalDraft.courseId"
            :label="t('devplan.course')"
            :placeholder="t('devplan.selectCourse')"
            :options="courseOptions"
          />
        </template>

        <div v-else-if="goalDraft.type === 'COMPETENCY'" class="grid gap-3 sm:grid-cols-2">
          <AppSelect
            v-if="!goalEditingId"
            v-model="goalDraft.competencyId"
            :label="t('devplan.competency')"
            :placeholder="t('devplan.selectCompetency')"
            :options="competencyOptions"
          />
          <AppInput
            v-model="goalDraft.targetLevel"
            type="number"
            :label="t('devplan.targetLevel')"
            :hint="t('devplan.targetLevelHint')"
          />
        </div>

        <AppInput
          v-else-if="goalDraft.type === 'OJT'"
          v-model="goalDraft.ojtChecklistId"
          :label="t('devplan.ojtChecklist')"
          :hint="t('devplan.ojtChecklistHint')"
        />

        <div class="grid gap-3 sm:grid-cols-3">
          <AppDatePicker v-model="goalDraft.targetDate" :label="t('devplan.targetDate')" />
          <AppInput v-model="goalDraft.weight" type="number" :label="t('devplan.weight')" :hint="t('devplan.weightHint')" />
          <AppInput v-model="goalDraft.cpeCredits" type="number" :label="t('devplan.cpe')" :hint="t('devplan.cpeHint')" />
        </div>

        <!-- Only the kinds the API will actually move. A COURSE or COMPETENCY
             goal is answered with GOAL_PROGRESS_DERIVED, so there is nothing
             to type here for them. -->
        <AppInput
          v-if="goalEditingId && isManualType(goalDraft.type)"
          v-model="goalDraft.progressPercent"
          type="number"
          :label="t('devplan.progressPercentLabel')"
          :hint="t('devplan.manualHint')"
        />
        <p v-else-if="goalEditingId" class="text-caption text-ink-faint">
          <Icon name="info" size="12" class="mr-1 inline" />
          {{ t('devplan.derivedHint') }}
        </p>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="goalModalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="goalSaving" @click="saveGoal">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <!-- Record a review -->
    <Modal v-model="reviewModalOpen" size="lg" :title="t('devplan.reviewTitle')">
      <div v-if="plan" class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <AppSelect
            v-model="reviewDraft.decision"
            :label="t('devplan.decision')"
            :options="[
              { value: 'APPROVED', label: t('devplan.decisionValue.APPROVED') },
              { value: 'CHANGES_REQUESTED', label: t('devplan.decisionValue.CHANGES_REQUESTED') },
            ]"
          />
          <AppInput v-model="reviewDraft.period" :label="t('devplan.period')" :placeholder="t('devplan.titlePlaceholder')" />
          <AppSelect
            v-model="reviewDraft.overallRating"
            :label="t('devplan.rating')"
            :placeholder="t('devplan.noRating')"
            :options="ratingOptions"
          />
        </div>

        <div>
          <label :for="commentId" class="mb-1.5 block text-small font-medium text-ink">{{ t('devplan.comment') }}</label>
          <textarea
            :id="commentId"
            v-model="reviewDraft.comment"
            rows="3"
            :placeholder="t('devplan.commentPlaceholder')"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div class="rounded-lg border border-border p-3">
          <p class="text-small font-medium text-ink">{{ t('devplan.goals') }}</p>
          <div class="mt-2 space-y-2">
            <div v-for="goal in plan.goals" :key="goal.id" class="flex flex-wrap items-center gap-2">
              <span class="w-full truncate text-caption text-ink-muted sm:w-48">
                {{ goal.title }} · {{ goal.progressPercent }}%
              </span>
              <AppInput
                v-model="reviewDraft.goalComments[goal.id]"
                class="min-w-0 flex-1"
                :aria-label="t('devplan.goalComment') + ': ' + goal.title"
                :placeholder="t('devplan.goalComment')"
              />
            </div>
          </div>
        </div>

        <label class="flex items-center gap-2 text-small text-ink">
          <input
            v-model="reviewDraft.completePlan"
            type="checkbox"
            class="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary"
          />
          {{ t('devplan.completePlan') }}
        </label>

        <p v-if="reviewDraft.decision === 'APPROVED' && pendingCredits" class="text-caption text-warning">
          <Icon name="award" size="12" class="mr-1 inline" />
          {{ t('devplan.creditsPending', { n: pendingCredits }) }}
        </p>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="reviewModalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="reviewSaving" @click="submitReview">{{ t('devplan.review') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
