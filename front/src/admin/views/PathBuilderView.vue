<script setup>
/**
 * The trajectory builder — one path, seven tabs (rasm 2026-09-11):
 *
 *   Struktura      stages on a timeline, "Kun N" per course in BY_DAYS
 *                  mode, a deadline dropdown per course, "+ Qo'shish" per
 *                  stage, the order-mode select
 *   Asosiy         title, description, learning time, thumbnail, cover,
 *                  curator, tags, preview link
 *   Bildirishnomalar   the four switches, with the assignment text
 *   Kirishni boshqarish  auto-assignment rules, the catalogue flag, the
 *                  default deadline
 *   Yakunlash      certificate + validity, status
 *   Tayinlashlar   who is on it, and putting somebody on it
 *   Hisobotlar     the numbers, and the path-progress export
 *
 * One `save()` PATCHes everything the tabs edit; the item `order` is
 * rewritten from the position on screen (stages in order, items within
 * each), so what the administrator sees is what the server sequences by.
 * Stage ids are minted here so a course can point at a brand-new stage in
 * the same save.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { pathsApi } from '@/services/paths'
import { coursesApi } from '@/services/courses'
import { certificatesApi } from '@/services/certificates'
import { usersApi } from '@/services/users'
import { rolesApi } from '@/services/roles'
import { reportsApi } from '@/services/reports'
import { enrollmentRulesApi } from '@/services/enrollmentRules'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import UserPicker from '@/components/ui/UserPicker.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const TABS = ['structure', 'basic', 'notifications', 'access', 'completion', 'assignments', 'reports']
const ORDER_MODES = ['BY_DAYS', 'SEQUENTIAL', 'FREE']
const DEADLINE_OPTIONS = [0, 1, 3, 7, 14, 30, 60, 90, 180, 365]
const LEARNING_TIME_OPTIONS = [0, 30, 60, 120, 240, 480, 960, 2400]
const DAY_OPTIONS = Array.from({ length: 91 }, (_, i) => i)
const TITLE_MAX = 200
const DESCRIPTION_MAX = 4000

const path = ref(null)
const loading = ref(true)
const saving = ref(false)
const tab = ref(TABS.includes(route.query.tab) ? route.query.tab : 'structure')

const courses = ref([])
const templates = ref([])
const enrollments = ref([])
const loadingEnrollments = ref(false)
const rules = ref([])
const loadingRules = ref(false)
const roles = ref([])
const departments = ref([])
const branches = ref([])
const positions = ref([])

const pickerOpen = ref(false)
const pickerStage = ref(null)
const pickerSelection = ref(new Set())
const menuFor = ref('')
const editingCurator = ref(false)
const tagInput = ref('')
const editingAssignText = ref(false)

const ruleOpen = ref(false)
const ruleSaving = ref(false)
const ruleForm = reactive({ name: '', roles: [], departments: [], branches: [], positions: [], deadlineDays: 0 })

const assignOpen = ref(false)
const assignSaving = ref(false)
const assignForm = reactive({ userId: '', userName: '', deadline: '', mandatory: true })

const courseById = computed(() => new Map(courses.value.map((course) => [course.id, course])))
const previewUrl = computed(() => `${window.location.origin}/paths/${route.params.id}`)

// ---- Structure --------------------------------------------------------

function mintId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const stages = computed(() => [...(path.value?.sections ?? [])].sort((a, b) => a.order - b.order))
const stageIds = computed(() => new Set(stages.value.map((stage) => stage.id)))

function itemsOf(stageId) {
  return (path.value?.items ?? []).filter((item) =>
    stageId ? item.sectionId === stageId : !item.sectionId || !stageIds.value.has(item.sectionId)
  )
}
// Items that point at no stage (or a deleted one) sit above the first stage.
const looseItems = computed(() => itemsOf(null))

/** A new stage at the end, or right after `after` when adding from a stage's own "+". */
function addStage(after = null) {
  const order = after ? after.order + 1 : stages.value.length
  for (const stage of path.value.sections) if (stage.order >= order) stage.order += 1
  path.value.sections.push({ id: mintId(), title: t('pathBuilder.stageDefault'), order, itemIds: [] })
}

function renameStage(stage) {
  const title = window.prompt(t('pathBuilder.renameStage'), stage.title)
  if (title && title.trim()) stage.title = title.trim()
  menuFor.value = ''
}

async function removeStage(stage) {
  menuFor.value = ''
  const ok = await confirm({
    title: t('pathBuilder.removeStageTitle'),
    message: t('pathBuilder.removeStageMessage', { title: stage.title }),
    confirmLabel: t('common.delete'),
  })
  if (!ok) return
  // The courses survive: they drop to "no stage" rather than out of the path.
  for (const item of path.value.items) if (item.sectionId === stage.id) item.sectionId = null
  path.value.sections = path.value.sections.filter((entry) => entry.id !== stage.id)
}

function moveStage(stage, delta) {
  const list = stages.value
  const index = list.indexOf(stage)
  const target = index + delta
  if (target < 0 || target >= list.length) return
  const other = list[target]
  ;[stage.order, other.order] = [other.order, stage.order]
  menuFor.value = ''
}

function moveItem(item, delta) {
  const siblings = itemsOf(item.sectionId && stageIds.value.has(item.sectionId) ? item.sectionId : null)
  const index = siblings.indexOf(item)
  const target = index + delta
  if (target < 0 || target >= siblings.length) return
  const all = path.value.items
  const a = all.indexOf(item)
  const b = all.indexOf(siblings[target])
  ;[all[a], all[b]] = [all[b], all[a]]
  menuFor.value = ''
}

function removeItem(item) {
  path.value.items = path.value.items.filter((entry) => entry !== item)
  menuFor.value = ''
}

async function openPicker(stageId = null) {
  pickerStage.value = stageId
  pickerSelection.value = new Set()
  pickerOpen.value = true
  if (courses.value.length) return
  try {
    const result = await coursesApi.list({ limit: 100 })
    courses.value = result.items
  } catch (error) {
    toast.error(apiErrorText(error, t('courses.loadFailed')))
  }
}

function togglePick(id) {
  const next = new Set(pickerSelection.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  pickerSelection.value = next
}

function addPicked() {
  for (const id of pickerSelection.value) {
    const course = courseById.value.get(id)
    path.value.items.push({
      id: `new-${id}`,
      type: 'COURSE',
      refId: id,
      order: path.value.items.length,
      required: true,
      prerequisiteIds: [],
      sectionId: pickerStage.value,
      startDay: 0,
      deadlineDays: 0,
      title: course?.title ?? '',
      cover: course?.cover ?? '',
      estimatedMinutes: course?.estimatedMinutes ?? 0,
    })
  }
  pickerOpen.value = false
}

const availableCourses = computed(() => {
  const used = new Set(path.value?.items?.map((item) => item.refId) ?? [])
  return courses.value.filter((course) => !used.has(course.id))
})

/** Stages in order, each followed by its items — the order the path is taken in. */
function flattenedItems() {
  const ordered = [...looseItems.value]
  for (const stage of stages.value) ordered.push(...itemsOf(stage.id))
  return ordered
}

// ---- Basic ------------------------------------------------------------

function addTag() {
  const value = tagInput.value.trim().replace(/,+$/, '')
  if (value && !path.value.tags.includes(value)) path.value.tags.push(value)
  tagInput.value = ''
}

function onCuratorPicked(user) {
  path.value.curatorId = user.id
  path.value.curator = { id: user.id, fullName: user.fullName, email: user.email ?? '', avatar: user.avatar ?? '' }
  editingCurator.value = false
}

function clearCurator() {
  path.value.curatorId = null
  path.value.curator = null
  editingCurator.value = false
}

async function copyPreview() {
  try {
    await navigator.clipboard.writeText(previewUrl.value)
    toast.success(t('pathBuilder.copied'))
  } catch {
    toast.error(t('pathBuilder.copyFailed'))
  }
}

// ---- Notifications ----------------------------------------------------

function addAfterReminder() {
  const days = path.value.notifications.afterDeadline.days
  const next = Math.max(0, ...days) + 1
  if (days.length < 10) days.push(next)
}

const DEFAULT_ASSIGN_SUBJECT = computed(() => t('pathBuilder.notify.assignSubjectDefault'))
const DEFAULT_ASSIGN_TEXT = computed(() => t('pathBuilder.notify.assignTextDefault'))

// ---- Access -----------------------------------------------------------

const pathRules = computed(() => rules.value.filter((rule) => (rule.grant?.pathIds ?? []).map(String).includes(route.params.id)))

async function loadRules() {
  loadingRules.value = true
  try {
    rules.value = await enrollmentRulesApi.list()
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loadingRules.value = false
  }
}

async function openRule() {
  Object.assign(ruleForm, { name: '', roles: [], departments: [], branches: [], positions: [], deadlineDays: path.value.defaultDeadlineDays || 0 })
  ruleOpen.value = true
  if (!roles.value.length) {
    const [roleRows, deps, brs, poss] = await Promise.all([
      rolesApi.list().catch(() => []),
      usersApi.departments().catch(() => []),
      usersApi.branches().catch(() => []),
      usersApi.positions().catch(() => []),
    ])
    roles.value = Array.isArray(roleRows) ? roleRows : roleRows?.items ?? []
    departments.value = deps
    branches.value = brs
    positions.value = poss
  }
}

function toggleIn(list, value) {
  const index = list.indexOf(value)
  if (index >= 0) list.splice(index, 1)
  else list.push(value)
}

const ruleHasMatch = computed(() => ['roles', 'departments', 'branches', 'positions'].some((key) => ruleForm[key].length))

async function saveRule() {
  ruleSaving.value = true
  try {
    const rule = await enrollmentRulesApi.create({
      name: ruleForm.name || `${path.value.title} — ${t('pathBuilder.access.rule')}`,
      match: { roles: ruleForm.roles, departments: ruleForm.departments, branches: ruleForm.branches, positions: ruleForm.positions },
      grant: { pathIds: [route.params.id], deadlineDays: Number(ruleForm.deadlineDays) || 0, mandatory: true },
    })
    // Created off; switched on here, which applies it at once (the
    // controller runs it on activation).
    await enrollmentRulesApi.update(rule._id ?? rule.id, { active: true })
    toast.success(t('pathBuilder.access.ruleSaved'))
    ruleOpen.value = false
    await loadRules()
    enrollments.value = []
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  } finally {
    ruleSaving.value = false
  }
}

async function toggleRule(rule) {
  try {
    await enrollmentRulesApi.update(rule._id, { active: !rule.active })
    await loadRules()
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  }
}

async function removeRule(rule) {
  const ok = await confirm({
    title: t('pathBuilder.access.removeRuleTitle'),
    message: t('pathBuilder.access.removeRuleMessage', { name: rule.name }),
    confirmLabel: t('common.delete'),
  })
  if (!ok) return
  try {
    await enrollmentRulesApi.remove(rule._id)
    await loadRules()
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  }
}

function ruleSummary(rule) {
  const parts = []
  const m = rule.match ?? {}
  if (m.roles?.length) parts.push(`${t('pathBuilder.access.roles')}: ${m.roles.join(', ')}`)
  if (m.departments?.length) parts.push(`${t('pathBuilder.access.departments')}: ${m.departments.join(', ')}`)
  if (m.branches?.length) parts.push(`${t('pathBuilder.access.branches')}: ${m.branches.join(', ')}`)
  if (m.positions?.length) parts.push(`${t('pathBuilder.access.positions')}: ${m.positions.join(', ')}`)
  return parts.join(' · ')
}

// ---- Assignments / reports -------------------------------------------

async function loadEnrollments() {
  loadingEnrollments.value = true
  try {
    enrollments.value = await pathsApi.enrollments(route.params.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loadingEnrollments.value = false
  }
}

async function assignUser() {
  if (!assignForm.userId) return
  assignSaving.value = true
  try {
    await pathsApi.assign(route.params.id, {
      userId: assignForm.userId,
      mandatory: assignForm.mandatory,
      deadline: assignForm.deadline ? new Date(assignForm.deadline).toISOString() : null,
    })
    toast.success(t('pathBuilder.assign.done', { name: assignForm.userName }))
    assignOpen.value = false
    Object.assign(assignForm, { userId: '', userName: '', deadline: '', mandatory: true })
    await loadEnrollments()
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  } finally {
    assignSaving.value = false
  }
}

const stats = computed(() => {
  const rows = enrollments.value
  const now = Date.now()
  const done = rows.filter((row) => row.status === 'COMPLETED')
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === 'ACTIVE').length,
    completed: done.length,
    overdue: rows.filter((row) => row.status === 'ACTIVE' && row.deadline && new Date(row.deadline).getTime() < now).length,
    average: rows.length ? Math.round(rows.reduce((sum, row) => sum + (row.completionPercent ?? 0), 0) / rows.length) : 0,
  }
})

const exporting = ref('')
async function exportReport(format) {
  exporting.value = format
  try {
    await reportsApi.download('path-progress', format, { pathId: route.params.id })
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.error')))
  } finally {
    exporting.value = ''
  }
}

// ---- Load / save ------------------------------------------------------

function switchTab(value) {
  tab.value = value
  router.replace({ query: { ...route.query, tab: value } })
  if (value === 'access' && !rules.value.length) loadRules()
  if ((value === 'assignments' || value === 'reports') && !enrollments.value.length) loadEnrollments()
}

async function load() {
  loading.value = true
  try {
    const data = await pathsApi.getById(route.params.id)
    data.tags = data.tags ?? []
    data.sections = data.sections ?? []
    path.value = data
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!path.value.title?.trim()) {
    toast.error(t('pathBuilder.titleRequired'))
    return
  }
  saving.value = true
  try {
    const p = path.value
    const orderedItems = flattenedItems()
    const sections = stages.value.map((stage, index) => ({
      id: stage.id,
      title: stage.title,
      order: index,
      itemIds: [],
    }))
    await pathsApi.update(route.params.id, {
      title: p.title,
      description: p.description ?? '',
      kind: p.kind,
      status: p.status,
      orderMode: p.orderMode,
      thumbnail: p.thumbnail ?? '',
      cover: p.cover ?? '',
      curatorId: p.curatorId || null,
      tags: p.tags,
      learningTimeMinutes: Number(p.learningTimeMinutes) || 0,
      inCatalog: Boolean(p.inCatalog),
      defaultDeadlineDays: Number(p.defaultDeadlineDays) || 0,
      notifications: {
        assign: { enabled: p.notifications.assign.enabled, subject: p.notifications.assign.subject ?? '', text: p.notifications.assign.text ?? '' },
        beforeDeadline: { enabled: p.notifications.beforeDeadline.enabled, days: Number(p.notifications.beforeDeadline.days) || 3 },
        afterDeadline: {
          enabled: p.notifications.afterDeadline.enabled,
          days: p.notifications.afterDeadline.days.map(Number).filter((d) => d > 0),
        },
        completionToAdmins: p.notifications.completionToAdmins,
      },
      targetRoles: p.targetRoles,
      branches: p.branches,
      department: p.department,
      certificateTemplateId: p.certificateTemplateId || null,
      validityDays: Number(p.validityDays) || 0,
      sections,
      items: orderedItems.map((item, index) => ({
        type: item.type,
        refId: item.refId,
        order: index,
        required: item.required,
        prerequisiteIds: item.prerequisiteIds ?? [],
        sectionId: item.sectionId && stageIds.value.has(item.sectionId) ? item.sectionId : null,
        startDay: Number(item.startDay) || 0,
        deadlineDays: Number(item.deadlineDays) || 0,
      })),
    })
    toast.success(t('pathBuilder.saved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  } finally {
    saving.value = false
  }
}

const statusVariant = { ACTIVE: 'info', COMPLETED: 'success', CANCELLED: 'neutral', EXPIRED: 'warning' }

function deadlineLabel(days) {
  return days ? t('pathBuilder.days', { n: days }) : t('pathBuilder.noDeadline')
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—'
}

onMounted(async () => {
  await load()
  if (tab.value === 'access') loadRules()
  if (tab.value === 'assignments' || tab.value === 'reports') loadEnrollments()
  const [courseResult] = await Promise.all([
    coursesApi.list({ limit: 100 }).catch(() => ({ items: [] })),
    certificatesApi
      .templates()
      .then((rows) => {
        templates.value = rows
      })
      .catch(() => {
        templates.value = []
      }),
  ])
  courses.value = courseResult.items
})
</script>

<template>
  <div class="mx-auto w-full max-w-[1600px] px-6 pb-10 pt-4" @click="menuFor = ''">
    <button type="button" class="flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink" @click="router.push('/bos/paths')">
      <Icon name="chevron-left" size="14" />
      {{ t('pathBuilder.backToMaterials') }}
    </button>

    <div v-if="loading" class="mt-4 space-y-3">
      <Skeleton class="h-28 w-full rounded-2xl" />
      <Skeleton class="h-96 w-full rounded-2xl" />
    </div>

    <template v-else-if="path">
      <!-- Header card -->
      <section class="mt-4 flex items-start justify-between gap-4 rounded-2xl bg-surface px-6 py-7 shadow-sm">
        <div class="min-w-0">
          <h1 class="truncate text-[22px] font-semibold text-ink">{{ path.title || t('pathBuilder.untitled') }}</h1>
          <p class="mt-1.5 text-[13px] text-ink-muted">{{ t('pathBuilder.subtitle') }}</p>
        </div>
        <a
          :href="previewUrl"
          target="_blank"
          rel="noopener"
          class="flex shrink-0 items-center gap-2 rounded-md bg-surface-2 px-4 py-2 text-[14px] text-ink transition-default hover:bg-surface-hover"
        >
          <Icon name="play" size="14" />
          {{ t('pathBuilder.preview') }}
        </a>
      </section>

      <!-- Tabs card -->
      <section class="mt-3 rounded-2xl bg-surface shadow-sm">
        <div class="flex overflow-x-auto border-b border-border">
          <button
            v-for="value in TABS"
            :key="value"
            type="button"
            class="relative shrink-0 border-r border-border px-6 py-3 text-[14px] transition-default"
            :class="tab === value ? 'text-ink' : 'text-ink-muted hover:text-ink'"
            @click="switchTab(value)"
          >
            <span v-if="tab === value" class="absolute inset-x-0 top-0 h-[3px] bg-primary" />
            {{ t(`pathBuilder.tabs.${value}`) }}
          </button>
        </div>

        <!-- ===== Structure ===== -->
        <div v-if="tab === 'structure'" class="min-h-[520px] px-6 py-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <p class="text-[13px] text-ink">{{ t('pathBuilder.structure.hint') }}</p>
            <div class="flex items-center gap-3">
              <span class="text-[13px] text-ink-muted">{{ t('pathBuilder.structure.orderMode') }}:</span>
              <AppSelect
                v-model="path.orderMode"
                class="w-56"
                :aria-label="t('pathBuilder.structure.orderMode')"
                :options="ORDER_MODES.map((value) => ({ value, label: t(`pathBuilder.structure.modes.${value}`) }))"
              />
              <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
            </div>
          </div>

          <div class="mt-6 grid grid-cols-[120px_1fr_200px] items-center border-b border-border pb-2 text-[12px] text-ink-muted">
            <span>{{ path.orderMode === 'BY_DAYS' ? t('pathBuilder.structure.assignDate') : '' }}</span>
            <span class="pl-8">{{ t('pathBuilder.structure.courseOrStage') }}</span>
            <span class="text-right pr-12">{{ t('pathBuilder.structure.deadline') }}</span>
          </div>

          <!-- Empty: one green "+ Qo'shish" in the middle (rasm 12.28), which
               offers a course or a stage. -->
          <div v-if="!path.items.length && !stages.length" class="flex flex-col items-center py-20 text-center">
            <span class="flex h-24 w-24 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
              <Icon name="refresh" size="40" />
            </span>
            <p class="mt-8 max-w-[300px] text-[14px] leading-relaxed text-ink-muted">{{ t('pathBuilder.structure.emptyHint') }}</p>
            <div class="relative mt-6" @click.stop>
              <AppButton icon="plus" @click="menuFor = menuFor === 'empty' ? '' : 'empty'">{{ t('pathBuilder.structure.add') }}</AppButton>
              <div v-if="menuFor === 'empty'" class="absolute left-1/2 z-20 mt-3 flex -translate-x-1/2 gap-2 rounded-xl bg-surface p-3 shadow-lg ring-1 ring-border">
                <button type="button" class="flex h-[104px] w-[88px] flex-col items-center justify-center gap-4 rounded-lg bg-surface-2 text-[14px] text-ink hover:bg-surface-hover" @click="menuFor = ''; addStage()">
                  <Icon name="map-pin" size="26" class="text-ink-muted" /> {{ t('pathBuilder.structure.stage') }}
                </button>
                <button type="button" class="flex h-[104px] w-[88px] flex-col items-center justify-center gap-4 rounded-lg text-[14px] text-ink hover:bg-surface-2" @click="menuFor = ''; openPicker(null)">
                  <Icon name="book-open" size="26" class="text-ink-muted" /> {{ t('pathBuilder.structure.course') }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="relative mt-2">
            <!-- The dotted timeline behind the stage markers -->
            <div class="absolute bottom-8 left-[103px] top-14 border-l-2 border-dotted border-border-strong" />

            <!-- Loose items (no stage) -->
            <template v-if="looseItems.length">
              <div v-for="item in looseItems" :key="item.id" class="grid grid-cols-[120px_1fr_200px] items-center border-b border-border py-3">
                <div class="relative z-10 pr-4">
                  <select
                    v-if="path.orderMode === 'BY_DAYS'"
                    v-model.number="item.startDay"
                    class="w-[104px] rounded-full bg-surface-2 py-1.5 pl-3 pr-7 text-[12px] text-ink outline-none"
                  >
                    <option v-for="d in DAY_OPTIONS" :key="d" :value="d">{{ t('pathBuilder.day', { n: d }) }}</option>
                  </select>
                </div>
                <div class="flex items-center gap-4 pl-8">
                  <div class="h-16 w-[115px] shrink-0 overflow-hidden rounded bg-surface-2">
                    <img v-if="item.cover" :src="item.cover" alt="" class="h-full w-full object-cover" />
                    <div v-else class="flex h-full w-full items-center justify-center text-ink-faint"><Icon name="book-open" size="20" /></div>
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-[14px] text-ink" :class="item.missing ? 'text-danger' : ''">{{ item.title ?? t('paths.missingCourse') }}</p>
                    <p v-if="!item.required" class="text-[12px] text-ink-faint">{{ t('paths.optional') }}</p>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2" @click.stop>
                  <div class="relative">
                    <Icon name="clock" size="14" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <select v-model.number="item.deadlineDays" class="w-[132px] rounded-md border border-border-strong bg-surface py-2 pl-8 pr-6 text-[13px] text-ink outline-none">
                      <option v-for="d in DEADLINE_OPTIONS" :key="d" :value="d">{{ deadlineLabel(d) }}</option>
                    </select>
                  </div>
                  <div class="relative">
                    <button type="button" class="rounded-md bg-surface-2 p-2 text-ink hover:bg-surface-hover" @click="menuFor = menuFor === item.id ? '' : item.id">
                      <Icon name="more-horizontal" size="16" />
                    </button>
                    <div v-if="menuFor === item.id" class="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border bg-surface py-1 text-[13px] shadow-md">
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" @click="item.required = !item.required; menuFor = ''">
                        <Icon :name="item.required ? 'check-square' : 'check'" size="14" /> {{ item.required ? t('pathBuilder.makeOptional') : t('pathBuilder.makeRequired') }}
                      </button>
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" @click="moveItem(item, -1)"><Icon name="chevron-up" size="14" /> {{ t('pathBuilder.moveUp') }}</button>
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" @click="moveItem(item, 1)"><Icon name="chevron-down" size="14" /> {{ t('pathBuilder.moveDown') }}</button>
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-danger hover:bg-surface-2" @click="removeItem(item)"><Icon name="trash" size="14" /> {{ t('common.delete') }}</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-[120px_1fr] py-3">
                <span />
                <button type="button" class="flex items-center gap-2 pl-8 text-[13px] text-primary hover:underline" @click="openPicker(null)">
                  <Icon name="plus" size="16" class="rounded-full border border-primary" /> {{ t('pathBuilder.structure.add') }}
                </button>
              </div>
            </template>

            <!-- Stages -->
            <div v-for="(stage, index) in stages" :key="stage.id" class="group/stage pt-6">
              <div class="grid grid-cols-[120px_1fr_200px] items-center">
                <div class="relative z-10 flex justify-end pr-[4px]">
                  <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border-strong bg-surface">
                    <span class="h-3 w-3 rounded-full border-2 border-border" />
                  </span>
                </div>
                <h3 class="pl-8 text-[18px] font-semibold text-ink">{{ stage.title }}</h3>
                <div class="relative flex justify-end" @click.stop>
                  <button type="button" class="rounded-md p-2 text-ink-muted opacity-0 transition-default hover:bg-surface-2 group-hover/stage:opacity-100 focus:opacity-100" :class="menuFor === stage.id ? 'opacity-100' : ''" @click="menuFor = menuFor === stage.id ? '' : stage.id">
                    <Icon name="more-horizontal" size="16" />
                  </button>
                  <div v-if="menuFor === stage.id" class="absolute right-0 top-9 z-20 w-48 rounded-md border border-border bg-surface py-1 text-[13px] shadow-md">
                    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" @click="renameStage(stage)"><Icon name="pencil" size="14" /> {{ t('pathBuilder.renameStage') }}</button>
                    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" :disabled="index === 0" @click="moveStage(stage, -1)"><Icon name="chevron-up" size="14" /> {{ t('pathBuilder.moveUp') }}</button>
                    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" :disabled="index === stages.length - 1" @click="moveStage(stage, 1)"><Icon name="chevron-down" size="14" /> {{ t('pathBuilder.moveDown') }}</button>
                    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-danger hover:bg-surface-2" @click="removeStage(stage)"><Icon name="trash" size="14" /> {{ t('common.delete') }}</button>
                  </div>
                </div>
              </div>
              <div class="ml-[120px] mt-2 border-b border-border pl-8" />

              <div v-for="item in itemsOf(stage.id)" :key="item.id" class="grid grid-cols-[120px_1fr_200px] items-center border-b border-border py-3">
                <div class="relative z-10 pr-4">
                  <select
                    v-if="path.orderMode === 'BY_DAYS'"
                    v-model.number="item.startDay"
                    class="w-[104px] rounded-full bg-surface-2 py-1.5 pl-3 pr-7 text-[12px] text-ink outline-none"
                  >
                    <option v-for="d in DAY_OPTIONS" :key="d" :value="d">{{ t('pathBuilder.day', { n: d }) }}</option>
                  </select>
                </div>
                <div class="flex items-center gap-4 pl-8">
                  <div class="h-16 w-[115px] shrink-0 overflow-hidden rounded bg-surface-2">
                    <img v-if="item.cover" :src="item.cover" alt="" class="h-full w-full object-cover" />
                    <div v-else class="flex h-full w-full items-center justify-center text-ink-faint"><Icon name="book-open" size="20" /></div>
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-[14px] text-ink" :class="item.missing ? 'text-danger' : ''">{{ item.title ?? t('paths.missingCourse') }}</p>
                    <p v-if="!item.required" class="text-[12px] text-ink-faint">{{ t('paths.optional') }}</p>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2" @click.stop>
                  <div class="relative">
                    <Icon name="clock" size="14" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <select v-model.number="item.deadlineDays" class="w-[132px] rounded-md border border-border-strong bg-surface py-2 pl-8 pr-6 text-[13px] text-ink outline-none">
                      <option v-for="d in DEADLINE_OPTIONS" :key="d" :value="d">{{ deadlineLabel(d) }}</option>
                    </select>
                  </div>
                  <div class="relative">
                    <button type="button" class="rounded-md bg-surface-2 p-2 text-ink hover:bg-surface-hover" @click="menuFor = menuFor === item.id ? '' : item.id">
                      <Icon name="more-horizontal" size="16" />
                    </button>
                    <div v-if="menuFor === item.id" class="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border bg-surface py-1 text-[13px] shadow-md">
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" @click="item.required = !item.required; menuFor = ''">
                        <Icon :name="item.required ? 'check-square' : 'check'" size="14" /> {{ item.required ? t('pathBuilder.makeOptional') : t('pathBuilder.makeRequired') }}
                      </button>
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" @click="moveItem(item, -1)"><Icon name="chevron-up" size="14" /> {{ t('pathBuilder.moveUp') }}</button>
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" @click="moveItem(item, 1)"><Icon name="chevron-down" size="14" /> {{ t('pathBuilder.moveDown') }}</button>
                      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-danger hover:bg-surface-2" @click="removeItem(item)"><Icon name="trash" size="14" /> {{ t('common.delete') }}</button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-[120px_1fr] py-3">
                <span class="relative z-10 flex justify-end pr-[13px] pt-1.5"><span class="h-1.5 w-1.5 rounded-full bg-border-strong" /></span>
                <div class="relative pl-8" @click.stop>
                  <button type="button" class="flex items-center gap-2 text-[13px] text-primary hover:underline" @click="menuFor = menuFor === `add-${stage.id}` ? '' : `add-${stage.id}`">
                    <Icon name="plus" size="16" class="rounded-full border border-primary" /> {{ t('pathBuilder.structure.add') }}
                  </button>
                  <div v-if="menuFor === `add-${stage.id}`" class="absolute left-8 z-20 mt-2 flex gap-2 rounded-xl bg-surface p-3 shadow-lg ring-1 ring-border">
                    <button type="button" class="flex h-[104px] w-[88px] flex-col items-center justify-center gap-4 rounded-lg bg-surface-2 text-[14px] text-ink hover:bg-surface-hover" @click="menuFor = ''; addStage(stage)">
                      <Icon name="map-pin" size="26" class="text-ink-muted" /> {{ t('pathBuilder.structure.stage') }}
                    </button>
                    <button type="button" class="flex h-[104px] w-[88px] flex-col items-center justify-center gap-4 rounded-lg text-[14px] text-ink hover:bg-surface-2" @click="menuFor = ''; openPicker(stage.id)">
                      <Icon name="book-open" size="26" class="text-ink-muted" /> {{ t('pathBuilder.structure.course') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- ===== Basic ===== -->
        <div v-else-if="tab === 'basic'" class="px-6 py-6">
          <div class="flex items-center justify-between gap-4 border-b border-border pb-6">
            <p class="text-[13px] text-ink">{{ t('pathBuilder.basic.hint') }}</p>
            <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
          </div>

          <h2 class="mt-8 text-[16px] text-ink">{{ t('pathBuilder.tabs.basic') }}</h2>
          <div class="mt-5 grid max-w-[600px] grid-cols-[150px_1fr] items-start gap-y-4 text-[13px]">
            <label class="pt-2.5 text-ink">{{ t('pathBuilder.pathTitle') }}*:</label>
            <div class="relative">
              <input v-model="path.title" :maxlength="TITLE_MAX" class="w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-16 text-[13px] text-ink outline-none focus:border-primary" />
              <span class="pointer-events-none absolute right-3 top-2.5 text-[11px] text-ink-faint">{{ (path.title || '').length }}/{{ TITLE_MAX }}</span>
            </div>

            <label class="pt-2.5 text-ink">{{ t('pathBuilder.description') }}:</label>
            <div class="relative">
              <textarea v-model="path.description" :maxlength="DESCRIPTION_MAX" rows="3" class="w-full rounded-md border border-border-strong bg-surface px-3 py-2 pb-6 text-[13px] text-ink outline-none focus:border-primary" />
              <span class="pointer-events-none absolute bottom-3 right-3 text-[11px] text-ink-faint">{{ (path.description || '').length }}/{{ DESCRIPTION_MAX }}</span>
            </div>

            <label class="pt-2.5 text-ink">{{ t('pathBuilder.basic.learningTime') }}:</label>
            <AppSelect
              v-model="path.learningTimeMinutes"
              :aria-label="t('pathBuilder.basic.learningTime')"
              :options="LEARNING_TIME_OPTIONS.map((value) => ({ value, label: value ? t('pathBuilder.basic.hours', { n: value / 60 }) : t('pathBuilder.basic.notSet') }))"
            />

            <label class="pt-2.5 text-ink">{{ t('pathBuilder.basic.thumbnail') }}:</label>
            <div class="w-[180px]"><ImageUploadField v-model="path.thumbnail" aspect="aspect-square" /></div>

            <label class="pt-2.5 text-ink">{{ t('pathBuilder.basic.cover') }}:</label>
            <ImageUploadField v-model="path.cover" aspect="aspect-video" />

            <label class="pt-2.5 text-ink">{{ t('pathBuilder.basic.curator') }}:</label>
            <div>
              <div v-if="path.curator && !editingCurator" class="flex items-center gap-3 py-1.5">
                <Avatar :name="path.curator.fullName" :src="path.curator.avatar" size="sm" />
                <span class="text-ink">{{ path.curator.fullName }}<span v-if="path.curator.email" class="text-ink-muted"> ({{ path.curator.email }})</span></span>
                <button type="button" class="text-primary hover:text-primary-strong" :title="t('common.edit')" @click="editingCurator = true"><Icon name="user-plus" size="16" /></button>
                <button type="button" class="text-primary hover:text-danger" :title="t('common.delete')" @click="clearCurator"><Icon name="trash" size="16" /></button>
              </div>
              <UserPicker v-else :placeholder="t('pathBuilder.basic.curatorPlaceholder')" @select="onCuratorPicked" />
            </div>

            <label class="pt-2.5 text-ink">{{ t('pathBuilder.basic.tags') }}:</label>
            <div class="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 py-1">
              <span v-for="tag in path.tags" :key="tag" class="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-ink">
                {{ tag }}
                <button type="button" class="text-ink-faint hover:text-ink" @click="path.tags = path.tags.filter((entry) => entry !== tag)"><Icon name="close" size="11" /></button>
              </span>
              <input
                v-model="tagInput"
                class="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-[13px] text-ink outline-none placeholder:text-ink-faint"
                :placeholder="t('pathBuilder.basic.tagsPlaceholder')"
                @keydown.enter.prevent="addTag"
                @blur="addTag"
              />
            </div>

            <label class="pt-2.5 text-ink">{{ t('pathBuilder.basic.previewLink') }}:</label>
            <div class="flex gap-2">
              <input :value="previewUrl" readonly class="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink-muted outline-none" />
              <AppButton variant="secondary" @click="copyPreview">{{ t('pathBuilder.copy') }}</AppButton>
            </div>
          </div>

          <h2 class="mt-10 text-[16px] text-ink">{{ t('pathBuilder.basic.publishing') }}</h2>
          <div class="mt-5 grid max-w-[600px] grid-cols-[150px_1fr] items-start gap-y-4 text-[13px]">
            <label class="pt-2.5 text-ink">{{ t('pathBuilder.status') }}:</label>
            <AppSelect v-model="path.status" :aria-label="t('pathBuilder.status')" :options="['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((value) => ({ value, label: t(`paths.status.${value}`) }))" />
            <label class="pt-2.5 text-ink">{{ t('pathBuilder.kind') }}:</label>
            <AppSelect v-model="path.kind" :aria-label="t('pathBuilder.kind')" :options="['GENERAL', 'ONBOARDING', 'CERTIFICATION', 'DEVELOPMENT'].map((value) => ({ value, label: t(`paths.kind.${value}`) }))" />
          </div>
        </div>

        <!-- ===== Notifications ===== -->
        <div v-else-if="tab === 'notifications'" class="px-6 py-6">
          <div class="flex items-center justify-between gap-4 border-b border-border pb-6">
            <p class="text-[13px] text-ink">{{ t('pathBuilder.notify.hint') }}</p>
            <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
          </div>

          <div class="border-b border-border py-8">
            <h2 class="text-[16px] text-ink">{{ t('pathBuilder.notify.assignTitle') }}</h2>
            <label class="mt-4 flex items-center gap-2 text-[13px] text-ink">
              <input v-model="path.notifications.assign.enabled" type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" />
              {{ t('pathBuilder.notify.assignEnabled') }}
            </label>
            <div v-if="path.notifications.assign.enabled" class="ml-6 mt-4 max-w-[560px] space-y-3">
              <div>
                <p class="text-[11px] text-ink-muted">{{ t('pathBuilder.notify.subject') }}</p>
                <input
                  v-model="path.notifications.assign.subject"
                  :placeholder="DEFAULT_ASSIGN_SUBJECT"
                  class="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <p class="text-[11px] text-ink-muted">{{ t('pathBuilder.notify.text') }}</p>
                <textarea
                  v-model="path.notifications.assign.text"
                  :placeholder="DEFAULT_ASSIGN_TEXT"
                  rows="6"
                  class="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-primary"
                />
                <p class="mt-1 text-[11px] text-ink-faint">{{ t('pathBuilder.notify.placeholders') }}</p>
              </div>
            </div>
          </div>

          <div class="border-b border-border py-8">
            <h2 class="text-[16px] text-ink">{{ t('pathBuilder.notify.beforeTitle') }}</h2>
            <label class="mt-4 flex items-center gap-3 text-[13px] text-ink">
              <button
                type="button"
                role="switch"
                :aria-checked="path.notifications.beforeDeadline.enabled"
                class="relative h-5 w-9 shrink-0 rounded-full transition-default"
                :class="path.notifications.beforeDeadline.enabled ? 'bg-primary' : 'bg-border-strong'"
                @click="path.notifications.beforeDeadline.enabled = !path.notifications.beforeDeadline.enabled"
              >
                <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" :class="path.notifications.beforeDeadline.enabled ? 'left-[18px]' : 'left-0.5'" />
              </button>
              {{ t('pathBuilder.notify.beforeEnabled') }}
            </label>
            <div v-if="path.notifications.beforeDeadline.enabled" class="ml-12 mt-3 flex items-center gap-2 text-[13px] text-ink">
              <input v-model.number="path.notifications.beforeDeadline.days" type="number" min="1" max="365" class="w-16 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-center text-[13px] outline-none" />
              {{ t('pathBuilder.notify.daysBefore') }}
            </div>
          </div>

          <div class="border-b border-border py-8">
            <h2 class="text-[16px] text-ink">{{ t('pathBuilder.notify.afterTitle') }}</h2>
            <label class="mt-4 flex items-center gap-3 text-[13px] text-ink">
              <button
                type="button"
                role="switch"
                :aria-checked="path.notifications.afterDeadline.enabled"
                class="relative h-5 w-9 shrink-0 rounded-full transition-default"
                :class="path.notifications.afterDeadline.enabled ? 'bg-primary' : 'bg-border-strong'"
                @click="path.notifications.afterDeadline.enabled = !path.notifications.afterDeadline.enabled"
              >
                <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" :class="path.notifications.afterDeadline.enabled ? 'left-[18px]' : 'left-0.5'" />
              </button>
              {{ t('pathBuilder.notify.afterEnabled') }}
            </label>
            <div v-if="path.notifications.afterDeadline.enabled" class="ml-12 mt-3 space-y-2">
              <div v-for="(days, i) in path.notifications.afterDeadline.days" :key="i" class="flex items-center gap-2 text-[13px] text-ink">
                <input v-model.number="path.notifications.afterDeadline.days[i]" type="number" min="1" max="365" class="w-16 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-center text-[13px] outline-none" />
                <span class="rounded-md border border-border-strong px-3 py-1.5 text-ink-muted">{{ t('pathBuilder.notify.daysUnit') }}</span>
                {{ t('pathBuilder.notify.afterDeadline') }}
                <button v-if="path.notifications.afterDeadline.days.length > 1" type="button" class="text-ink-faint hover:text-danger" @click="path.notifications.afterDeadline.days.splice(i, 1)"><Icon name="close" size="14" /></button>
              </div>
              <div class="flex items-center gap-4 pt-1 text-[13px]">
                <button type="button" class="flex items-center gap-1.5 text-primary hover:underline" @click="addAfterReminder"><Icon name="plus" size="14" /> {{ t('pathBuilder.notify.addReminder') }}</button>
                <span class="text-border-strong">|</span>
                <button type="button" class="flex items-center gap-1.5 text-primary hover:underline" @click="editingAssignText = !editingAssignText"><Icon name="pencil" size="14" /> {{ t('pathBuilder.notify.editText') }}</button>
              </div>
              <p v-if="editingAssignText" class="max-w-[560px] rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">{{ t('pathBuilder.notify.editTextHint') }}</p>
            </div>
          </div>

          <div class="py-8">
            <h2 class="text-[16px] text-ink">{{ t('pathBuilder.notify.completionTitle') }}</h2>
            <label class="mt-4 flex items-center gap-2 text-[13px] text-ink">
              <input v-model="path.notifications.completionToAdmins" type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" />
              {{ t('pathBuilder.notify.completionToAdmins') }}
            </label>
          </div>
        </div>

        <!-- ===== Access ===== -->
        <div v-else-if="tab === 'access'" class="px-6 py-6">
          <div class="flex items-center justify-between gap-4 border-b border-border pb-6">
            <p class="text-[13px] text-ink">{{ t('pathBuilder.access.hint') }}</p>
            <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
          </div>

          <div class="border-b border-border py-8">
            <h2 class="text-[16px] text-ink">{{ t('pathBuilder.access.autoTitle') }}</h2>
            <p class="mt-1 text-[13px] text-ink-muted">{{ t('pathBuilder.access.autoHint') }}</p>
            <div v-if="loadingRules" class="mt-4 space-y-2"><Skeleton class="h-10 w-96" /></div>
            <ul v-else-if="pathRules.length" class="mt-4 max-w-[800px] divide-y divide-border rounded-md border border-border">
              <li v-for="rule in pathRules" :key="rule._id" class="flex items-center gap-3 px-4 py-3 text-[13px]">
                <button
                  type="button"
                  role="switch"
                  :aria-checked="rule.active"
                  class="relative h-5 w-9 shrink-0 rounded-full transition-default"
                  :class="rule.active ? 'bg-primary' : 'bg-border-strong'"
                  @click="toggleRule(rule)"
                >
                  <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" :class="rule.active ? 'left-[18px]' : 'left-0.5'" />
                </button>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-ink">{{ rule.name }}</p>
                  <p class="truncate text-[12px] text-ink-muted">{{ ruleSummary(rule) }}<span v-if="rule.grant?.deadlineDays"> · {{ t('pathBuilder.days', { n: rule.grant.deadlineDays }) }}</span></p>
                </div>
                <button type="button" class="text-ink-faint hover:text-danger" @click="removeRule(rule)"><Icon name="trash" size="15" /></button>
              </li>
            </ul>
            <button type="button" class="mt-5 flex items-center gap-2 text-[14px] text-primary hover:underline" @click="openRule">
              <Icon name="plus" size="16" /> {{ t('pathBuilder.access.addRule') }}
            </button>
          </div>

          <div class="border-b border-border py-8">
            <h2 class="text-[16px] text-ink">{{ t('pathBuilder.access.catalogTitle') }}</h2>
            <p class="mt-1 text-[13px] text-ink-muted">{{ t('pathBuilder.access.catalogHint') }}</p>
            <div v-if="path.inCatalog" class="mt-5 flex items-center gap-4 text-[14px]">
              <span class="flex items-center gap-2 text-success"><Icon name="check-circle" size="16" /> {{ t('pathBuilder.access.inCatalog') }}</span>
              <button type="button" class="text-ink-muted hover:text-danger" @click="path.inCatalog = false">{{ t('pathBuilder.access.removeFromCatalog') }}</button>
            </div>
            <button v-else type="button" class="mt-5 flex items-center gap-2 text-[14px] text-primary hover:underline" @click="path.inCatalog = true">
              <Icon name="plus" size="16" /> {{ t('pathBuilder.access.addToCatalog') }}
            </button>
          </div>

          <div class="py-8">
            <h2 class="text-[16px] text-ink">{{ t('pathBuilder.access.defaultsTitle') }}</h2>
            <p class="mt-1 text-[13px] text-ink-muted">{{ t('pathBuilder.access.defaultsHint') }}</p>
            <div class="mt-5 flex items-center gap-8 text-[13px] text-ink">
              <span>{{ t('pathBuilder.structure.deadline') }}:</span>
              <AppSelect
                v-model="path.defaultDeadlineDays"
                class="w-72"
                :aria-label="t('pathBuilder.structure.deadline')"
                :options="DEADLINE_OPTIONS.map((value) => ({ value, label: deadlineLabel(value) }))"
              />
            </div>
          </div>
        </div>

        <!-- ===== Completion ===== -->
        <div v-else-if="tab === 'completion'" class="px-6 py-6">
          <div class="flex items-center justify-between gap-4 border-b border-border pb-6">
            <p class="text-[13px] text-ink">{{ t('pathBuilder.completion.hint') }}</p>
            <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
          </div>
          <h2 class="mt-8 text-[16px] text-ink">{{ t('pathBuilder.certificate') }}</h2>
          <div class="mt-5 grid max-w-[600px] grid-cols-[150px_1fr] items-start gap-y-4 text-[13px]">
            <label class="pt-2.5 text-ink">{{ t('courses.fields.certificateTemplate') }}:</label>
            <AppSelect
              v-model="path.certificateTemplateId"
              :aria-label="t('courses.fields.certificateTemplate')"
              :placeholder="t('courses.fields.noCertificate')"
              :options="templates.map((template) => ({ value: template._id, label: template.name }))"
            />
            <label class="pt-2.5 text-ink">{{ t('courses.fields.validityDays') }}:</label>
            <div>
              <AppInput v-model="path.validityDays" type="number" :aria-label="t('courses.fields.validityDays')" />
              <p class="mt-1 text-[12px] text-ink-faint">{{ t('courses.fields.validityDaysHint') }}</p>
            </div>
          </div>
          <h2 class="mt-10 text-[16px] text-ink">{{ t('pathBuilder.completion.ruleTitle') }}</h2>
          <p class="mt-2 max-w-[700px] text-[13px] text-ink-muted">{{ t('pathBuilder.completion.ruleHint', { required: path.items.filter((item) => item.required).length, total: path.items.length }) }}</p>
        </div>

        <!-- ===== Assignments ===== -->
        <div v-else-if="tab === 'assignments'" class="px-6 py-6">
          <div class="flex items-center justify-between gap-4 border-b border-border pb-6">
            <p class="text-[13px] text-ink">{{ t('pathBuilder.assign.hint') }}</p>
            <AppButton icon="user-plus" @click="assignOpen = true">{{ t('pathBuilder.assign.button') }}</AppButton>
          </div>
          <div v-if="loadingEnrollments" class="mt-6 space-y-2">
            <Skeleton v-for="n in 4" :key="n" class="h-12 w-full rounded-lg" />
          </div>
          <EmptyState v-else-if="!enrollments.length" class="py-12" icon="users" :title="t('pathBuilder.nobody')" :description="t('pathBuilder.nobodyHint')" />
          <table v-else class="mt-4 w-full text-[13px]">
            <thead class="border-b border-border text-left text-[12px] text-ink-muted">
              <tr>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.person') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.department') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.progressColumn') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.structure.deadline') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in enrollments" :key="row.userId" class="border-b border-border last:border-0">
                <td class="py-3.5 pr-4 text-ink">{{ row.fullName }}</td>
                <td class="py-3.5 pr-4 text-ink-muted">{{ row.department || '—' }}</td>
                <td class="py-3.5 pr-4">
                  <div class="flex items-center gap-2">
                    <ProgressBar class="w-24" size="sm" :value="row.completionPercent" />
                    <span class="text-[12px] text-ink-faint">{{ row.completionPercent }}%</span>
                  </div>
                </td>
                <td class="py-3.5 pr-4 text-ink-muted">{{ formatDate(row.deadline) }}</td>
                <td class="py-3.5 pr-4"><Badge :variant="statusVariant[row.status]" size="sm">{{ t(`pathBuilder.enrollment.${row.status}`) }}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ===== Reports ===== -->
        <div v-else class="px-6 py-6">
          <div class="flex items-center justify-between gap-4 border-b border-border pb-6">
            <p class="text-[13px] text-ink">{{ t('pathBuilder.reports.hint') }}</p>
            <div class="flex gap-2">
              <AppButton variant="secondary" icon="download" :loading="exporting === 'xlsx'" @click="exportReport('xlsx')">XLSX</AppButton>
              <AppButton variant="secondary" icon="download" :loading="exporting === 'csv'" @click="exportReport('csv')">CSV</AppButton>
            </div>
          </div>
          <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div v-for="key in ['total', 'active', 'completed', 'overdue', 'average']" :key="key" class="rounded-xl border border-border px-4 py-4">
              <p class="text-[12px] text-ink-muted">{{ t(`pathBuilder.reports.${key}`) }}</p>
              <p class="mt-1 text-[24px] font-semibold text-ink">{{ key === 'average' ? `${stats.average}%` : stats[key] }}</p>
            </div>
          </div>
          <div v-if="loadingEnrollments" class="mt-6 space-y-2"><Skeleton v-for="n in 3" :key="n" class="h-12 w-full rounded-lg" /></div>
          <EmptyState v-else-if="!enrollments.length" class="py-12" icon="bar-chart" :title="t('pathBuilder.nobody')" :description="t('pathBuilder.nobodyHint')" />
          <table v-else class="mt-6 w-full text-[13px]">
            <thead class="border-b border-border text-left text-[12px] text-ink-muted">
              <tr>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.person') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.status') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.progressColumn') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.structure.deadline') }}</th>
                <th class="py-3 pr-4 font-normal">{{ t('pathBuilder.reports.completedAt') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in enrollments" :key="row.userId" class="border-b border-border last:border-0">
                <td class="py-3.5 pr-4 text-ink">{{ row.fullName }}</td>
                <td class="py-3.5 pr-4"><Badge :variant="statusVariant[row.status]" size="sm">{{ t(`pathBuilder.enrollment.${row.status}`) }}</Badge></td>
                <td class="py-3.5 pr-4 text-ink">{{ row.completionPercent }}%</td>
                <td class="py-3.5 pr-4 text-ink-muted">{{ formatDate(row.deadline) }}</td>
                <td class="py-3.5 pr-4 text-ink-muted">{{ formatDate(row.completedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- Course picker -->
    <Modal v-model="pickerOpen" :title="t('pathBuilder.addCourses')" size="lg">
      <EmptyState v-if="!availableCourses.length" class="py-6" icon="book-open" :title="t('pathBuilder.pickerEmpty')" :description="t('pathBuilder.pickerEmptyHint')" />
      <div v-else class="max-h-80 space-y-1 overflow-y-auto">
        <button
          v-for="course in availableCourses"
          :key="course.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-default"
          :class="pickerSelection.has(course.id) ? 'bg-primary-subtle' : 'hover:bg-surface-hover'"
          @click="togglePick(course.id)"
        >
          <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border" :class="pickerSelection.has(course.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'">
            <Icon v-if="pickerSelection.has(course.id)" name="check" size="11" />
          </span>
          <div class="h-9 w-16 shrink-0 overflow-hidden rounded bg-surface-2">
            <img v-if="course.cover" :src="course.cover" alt="" class="h-full w-full object-cover" />
          </div>
          <span class="min-w-0">
            <span class="block truncate text-small text-ink">{{ course.title }}</span>
            <span class="block text-caption text-ink-faint">{{ t(`courses.status.${course.status.toLowerCase()}`) }}</span>
          </span>
        </button>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="pickerOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :disabled="!pickerSelection.size" @click="addPicked">{{ t('pathBuilder.addSelected', { count: pickerSelection.size }) }}</AppButton>
      </template>
    </Modal>

    <!-- Auto-assignment rule -->
    <Modal v-model="ruleOpen" :title="t('pathBuilder.access.addRule')" size="lg">
      <div class="space-y-4">
        <AppInput v-model="ruleForm.name" :label="t('pathBuilder.access.ruleName')" :placeholder="path?.title" />
        <p class="text-[12px] text-ink-muted">{{ t('pathBuilder.access.ruleHint') }}</p>
        <div v-for="(list, key) in { roles: roles.map((r) => r.name), departments, branches, positions }" :key="key">
          <p class="mb-1.5 text-small font-medium text-ink">{{ t(`pathBuilder.access.${key}`) }}</p>
          <p v-if="!list.length" class="text-[12px] text-ink-faint">—</p>
          <div v-else class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            <button
              v-for="value in list"
              :key="value"
              type="button"
              class="rounded-full border px-3 py-1 text-[12px] transition-default"
              :class="ruleForm[key].includes(value) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-ink-muted hover:text-ink'"
              @click="toggleIn(ruleForm[key], value)"
            >
              {{ value }}
            </button>
          </div>
        </div>
        <AppSelect v-model="ruleForm.deadlineDays" :label="t('pathBuilder.structure.deadline')" :options="DEADLINE_OPTIONS.map((value) => ({ value, label: deadlineLabel(value) }))" />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="ruleOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :disabled="!ruleHasMatch" :loading="ruleSaving" @click="saveRule">{{ t('pathBuilder.access.saveRule') }}</AppButton>
      </template>
    </Modal>

    <!-- Assign one person -->
    <Modal v-model="assignOpen" :title="t('pathBuilder.assign.button')" size="md">
      <div class="space-y-4">
        <UserPicker :label="t('pathBuilder.person')" :display-name="assignForm.userName" @select="(user) => { assignForm.userId = user.id; assignForm.userName = user.fullName }" @clear="assignForm.userId = ''" />
        <AppDatePicker v-model="assignForm.deadline" :label="t('pathBuilder.structure.deadline')" />
        <p v-if="!assignForm.deadline && path?.defaultDeadlineDays" class="text-[12px] text-ink-faint">{{ t('pathBuilder.assign.defaultHint', { n: path.defaultDeadlineDays }) }}</p>
        <label class="flex items-center gap-2 text-small text-ink">
          <input v-model="assignForm.mandatory" type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" />
          {{ t('pathBuilder.assign.mandatory') }}
        </label>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="assignOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :disabled="!assignForm.userId" :loading="assignSaving" @click="assignUser">{{ t('pathBuilder.assign.button') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
