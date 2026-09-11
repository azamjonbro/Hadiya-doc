<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { reportsApi } from '@/services/reports'
import { coursesApi } from '@/services/courses'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Chart from '@/components/ui/Chart.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppInput from '@/components/ui/AppInput.vue'
import UserPicker from '@/components/ui/UserPicker.vue'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const confirm = useConfirm()

const FORMATS = ['csv', 'xlsx', 'pdf']
// The worker writes spreadsheets only: a hundred-thousand-row PDF is not a
// document anybody opens.
const ASYNC_FORMAT = 'xlsx'

// The list comes from the server. It used to be five names hard-coded here
// while the backend had twenty-two, so seventeen reports existed, were
// tested, and could not be reached from any screen.
const types = ref([])
const typesError = ref('')

// Rasn 15–16's groups. A type the server offers that is not named here
// still shows, under "extra" — a new report must never vanish.
const TYPE_GROUPS = {
  learners: ['employee-progress', 'department-progress', 'group-progress', 'onboarding-progress'],
  courses: ['course-progress', 'video-analytics', 'quiz-results', 'question-difficulty', 'homework-submissions', 'path-progress', 'enrollment-audit', 'overdue-assignments'],
  events: ['event-attendance'],
  extra: [],
}
const groupedTypes = computed(() => {
  const placed = new Set(Object.values(TYPE_GROUPS).flat())
  return Object.entries(TYPE_GROUPS)
    .map(([key, list]) => ({
      key,
      types: key === 'extra' ? types.value.filter((type) => !placed.has(type)) : list.filter((type) => types.value.includes(type)),
    }))
    .filter((group) => group.types.length)
})

const typeIcon = {
  'employee-progress': 'users',
  'course-progress': 'graduation-cap',
  'video-analytics': 'video',
  'news-analytics': 'newspaper',
  'task-analytics': 'check-square',
  'certificate-register': 'award',
  'path-progress': 'layers',
  'quiz-results': 'check-square',
  'question-difficulty': 'info',
  'compliance-status': 'shield',
  'onboarding-progress': 'user-plus',
  'event-attendance': 'calendar',
  'homework-submissions': 'file-text',
  'delivery-log': 'send',
  'kb-usage': 'book-open',
  'group-progress': 'users',
  'department-progress': 'building',
  'overdue-assignments': 'alert-triangle',
  'enrollment-audit': 'list',
  'badge-awards': 'star',
  'login-activity': 'activity',
  'material-usage': 'paperclip',
}

// Keyed by `${type}:${format}` so each individual button shows its own
// loading/error state rather than blocking the whole page.
const pending = reactive({})
const errors = reactive({})

// What the last download of each type turned out to be: `{ truncated,
// totalRows, exportedRows }`. Kept after the file has been saved, because
// the warning is the only thing standing between an admin and a spreadsheet
// they believe is complete.
const lastExport = reactive({})

const roleOptions = Object.values(ROLES).map((r) => ({ value: r, label: r }))
const courseOptions = ref([])

const filters = reactive({ role: '', courseId: '', userId: '', userLabel: '', dateFrom: '', dateTo: '' })

const filterFields = computed(() => [
  { key: 'role', type: 'select', label: t('reports.filters.role'), placeholder: t('reports.filters.allRoles'), options: roleOptions },
  {
    key: 'courseId',
    type: 'select',
    width: 'w-52',
    label: t('reports.filters.course'),
    placeholder: t('reports.filters.allCourses'),
    options: courseOptions.value,
  },
  {
    key: 'userId',
    type: 'user',
    width: 'w-56',
    displayKey: 'userLabel',
    label: t('reports.filters.user'),
    placeholder: t('reports.filters.userPlaceholder'),
  },
  // Without a placeholder the date trigger renders as a bare calendar icon
  // and an empty box, which reads as a broken field rather than an empty one.
  { key: 'dateFrom', type: 'date', label: t('reports.filters.dateFrom'), placeholder: t('reports.filters.datePlaceholder') },
  { key: 'dateTo', type: 'date', label: t('reports.filters.dateTo'), placeholder: t('reports.filters.datePlaceholder') },
])

// `userLabel` is the name shown in the picker, not a filter the server knows.
const queryFilters = computed(() => {
  const { userLabel, ...rest } = filters
  return rest
})

function typeLabel(type) {
  // Falls back to the slug rather than rendering a raw i18n key: a report
  // added on the server before its translation lands should read as
  // "material-usage", not "reports.types.material-usage".
  return t(`reports.types.${type}`, type)
}

async function loadTypes() {
  try {
    types.value = await reportsApi.listTypes()
  } catch (error) {
    typesError.value = apiErrorText(error, t('reports.error'))
  }
}

async function loadCourseOptions() {
  try {
    const { items } = await coursesApi.list({ limit: 100 })
    courseOptions.value = items.map((c) => ({ value: c.id, label: c.title }))
  } catch {
    courseOptions.value = []
  }
}

async function onDownload(type, format) {
  const key = `${type}:${format}`
  pending[key] = true
  errors[key] = ''
  try {
    lastExport[type] = await reportsApi.download(type, format, queryFilters.value)
  } catch (error) {
    errors[key] = apiErrorText(error, t('reports.error'))
  } finally {
    pending[key] = false
  }
}

// ---------------------------------------------------------------- preview

/**
 * The report on screen (8.2, FL-29).
 *
 * Until this existed the only way to look at a report was to export it and
 * open the file — so "is this the filter I meant" cost a download, and the
 * answer arrived in Excel.
 */
const preview = ref(null)
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewError = ref('')
const previewType = ref('')
const chartColumn = ref('')

async function openPreview(type) {
  previewType.value = type
  previewOpen.value = true
  previewLoading.value = true
  previewError.value = ''
  preview.value = null
  try {
    const data = await reportsApi.preview(type, queryFilters.value)
    preview.value = data
    chartColumn.value = numericColumnsOf(data)[0]?.key ?? ''
  } catch (error) {
    previewError.value = apiErrorText(error, t('reports.error'))
  } finally {
    previewLoading.value = false
  }
}

// A column counts as numeric when every row that has a value has a number in
// it — tested against the data rather than declared by the server, because a
// builder's columns carry a header and a key and nothing about type.
function numericColumnsOf(data) {
  if (!data?.rows?.length) return []
  return data.columns.filter((column) =>
    data.rows.some((row) => typeof row[column.key] === 'number') &&
    data.rows.every((row) => row[column.key] == null || typeof row[column.key] === 'number')
  )
}

const numericColumns = computed(() => numericColumnsOf(preview.value))

const chartColumnOptions = computed(() =>
  numericColumns.value.map((column) => ({ value: column.key, label: column.header }))
)

// DataTable speaks {key, label}; a report builder speaks {key, header}.
const previewColumns = computed(
  () => preview.value?.columns.map((column) => ({ key: column.key, label: column.header })) ?? []
)

// The first column that is not one of the numbers — the thing each row *is*,
// which is what a bar wants as its label.
const labelColumn = computed(() => {
  const numeric = new Set(numericColumns.value.map((column) => column.key))
  return preview.value?.columns.find((column) => !numeric.has(column.key))?.key ?? ''
})

const CHART_BARS = 12

// Sorted and cut: twenty-two departments in one 300px-wide chart is a row of
// slivers, and the question a bar chart answers is "which are the biggest".
const chartSeries = computed(() => {
  if (!preview.value || !chartColumn.value || !labelColumn.value) return []
  return [...preview.value.rows]
    .filter((row) => typeof row[chartColumn.value] === 'number')
    .sort((a, b) => b[chartColumn.value] - a[chartColumn.value])
    .slice(0, CHART_BARS)
    .map((row) => ({ label: String(row[labelColumn.value] ?? '—'), value: row[chartColumn.value] }))
})

// ---------------------------------------------------------------- exports

const jobs = ref([])
const queueing = reactive({})
let poller = null

const hasUnfinishedJobs = computed(() => jobs.value.some((job) => job.status === 'QUEUED' || job.status === 'RUNNING'))

async function loadJobs() {
  try {
    jobs.value = await reportsApi.exportJobs()
  } catch {
    // The panel is a convenience; a failure to list old exports is not worth
    // an error banner over the reports themselves.
    jobs.value = []
  }
  syncPoller()
}

// Polled only while something is actually being built, and stopped as soon
// as nothing is — a screen left open on a finished list should not keep
// asking a shared server the same question every few seconds.
function syncPoller() {
  if (hasUnfinishedJobs.value && !poller) {
    poller = setInterval(loadJobs, 4000)
  } else if (!hasUnfinishedJobs.value && poller) {
    clearInterval(poller)
    poller = null
  }
}

async function queueFullExport(type) {
  queueing[type] = true
  try {
    await reportsApi.queueExport(type, ASYNC_FORMAT, queryFilters.value)
    toast.success(t('reports.exports.queued'))
    await loadJobs()
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.exports.queueFailed')))
  } finally {
    queueing[type] = false
  }
}

/**
 * Fetches the job again to get a fresh signed link, then follows it.
 *
 * The link is deliberately not held in the list: it is signed and expires in
 * minutes, so one rendered when the page loaded would be dead by the time
 * anybody clicked it.
 */
async function downloadJob(job) {
  try {
    const fresh = await reportsApi.exportJob(job.id)
    if (!fresh.url) {
      toast.error(t('reports.exports.linkExpired'))
      await loadJobs()
      return
    }
    window.location.assign(fresh.url)
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.exports.linkFailed')))
  }
}

const statusVariant = { QUEUED: 'neutral', RUNNING: 'info', READY: 'success', FAILED: 'danger' }

function formatCount(value) {
  return typeof value === 'number' ? value.toLocaleString() : '—'
}

// -------------------------------------------------------------- schedules

/**
 * Reports that build themselves on a timetable (8.4).
 *
 * The panel only exists for someone holding report:schedule — hiding it
 * otherwise is a courtesy, not the rule: the routes check the same thing.
 */
const canSchedule = computed(() => auth.hasPermission('report:schedule'))

const schedules = ref([])
const scheduleModal = ref(false)
const scheduleSaving = ref(false)
const scheduleError = ref('')
const runningSchedule = reactive({})

const BLANK_SCHEDULE = {
  name: '',
  type: '',
  format: 'xlsx',
  cadence: 'WEEKLY',
  hour: 7,
  dayOfWeek: 1,
  dayOfMonth: 1,
  recipients: [],
  active: true,
}
const scheduleForm = reactive({ ...BLANK_SCHEDULE })
// Names for the chips. The API stores ids; nobody recognises an ObjectId.
const recipientNames = ref({})

const cadenceOptions = computed(() =>
  ['DAILY', 'WEEKLY', 'MONTHLY'].map((value) => ({ value, label: t(`reports.schedules.cadence.${value}`) }))
)
const scheduleTypeOptions = computed(() => types.value.map((type) => ({ value: type, label: typeLabel(type) })))
const hourOptions = computed(() =>
  Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: `${String(hour).padStart(2, '0')}:00` }))
)
const weekdayOptions = computed(() =>
  // Sunday first, matching what the API stores (0 = Sunday, like Date#getDay).
  Array.from({ length: 7 }, (_, day) => ({ value: day, label: t(`reports.schedules.weekday.${day}`) }))
)
// Stops at 28 exactly as the server does — "the 31st" is a date five months
// of the year do not have, and offering it would only move the surprise.
const monthDayOptions = computed(() =>
  Array.from({ length: 28 }, (_, index) => ({ value: index + 1, label: String(index + 1) }))
)

async function loadSchedules() {
  if (!canSchedule.value) return
  try {
    schedules.value = await reportsApi.schedules()
  } catch {
    schedules.value = []
  }
}

function openScheduleModal() {
  Object.assign(scheduleForm, { ...BLANK_SCHEDULE, type: types.value[0] ?? '', recipients: [] })
  recipientNames.value = {}
  scheduleError.value = ''
  scheduleModal.value = true
}

function addRecipient(user) {
  if (!user || scheduleForm.recipients.includes(user.id)) return
  scheduleForm.recipients.push(user.id)
  recipientNames.value = { ...recipientNames.value, [user.id]: user.fullName }
}

function removeRecipient(id) {
  scheduleForm.recipients = scheduleForm.recipients.filter((value) => value !== id)
}

async function saveSchedule() {
  if (!scheduleForm.name || !scheduleForm.type) {
    scheduleError.value = t('reports.schedules.nameAndTypeRequired')
    return
  }
  scheduleSaving.value = true
  scheduleError.value = ''
  try {
    // The filters as they stand on screen ride along, so a schedule is
    // "this report, exactly as I have it filtered right now".
    await reportsApi.createSchedule({ ...scheduleForm, filters: queryFilters.value })
    scheduleModal.value = false
    toast.success(t('reports.schedules.created'))
    await loadSchedules()
  } catch (error) {
    scheduleError.value = apiErrorText(error, t('reports.schedules.saveFailed'))
  } finally {
    scheduleSaving.value = false
  }
}

async function toggleSchedule(schedule) {
  try {
    await reportsApi.updateSchedule(schedule.id, { active: !schedule.active })
    await loadSchedules()
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.schedules.saveFailed')))
  }
}

async function runScheduleNow(schedule) {
  runningSchedule[schedule.id] = true
  try {
    await reportsApi.runSchedule(schedule.id)
    toast.success(t('reports.exports.queued'))
    await Promise.all([loadSchedules(), loadJobs()])
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.exports.queueFailed')))
  } finally {
    runningSchedule[schedule.id] = false
  }
}

async function removeSchedule(schedule) {
  if (!(await confirm.ask({ message: t('reports.schedules.confirmDelete', { name: schedule.name }) }))) return
  try {
    await reportsApi.deleteSchedule(schedule.id)
    await loadSchedules()
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.schedules.saveFailed')))
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale.value, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cadenceSummary(schedule) {
  const at = `${String(schedule.hour).padStart(2, '0')}:00`
  if (schedule.cadence === 'DAILY') return t('reports.schedules.summary.daily', { at })
  if (schedule.cadence === 'WEEKLY') {
    return t('reports.schedules.summary.weekly', { day: t(`reports.schedules.weekday.${schedule.dayOfWeek}`), at })
  }
  return t('reports.schedules.summary.monthly', { day: schedule.dayOfMonth, at })
}

onMounted(() => {
  loadTypes()
  loadCourseOptions()
  loadJobs()
  loadSchedules()
})

onUnmounted(() => {
  if (poller) clearInterval(poller)
})
</script>

<template>
  <!-- Rasn 15–16: the reports are a grouped list — a small grey group
       label, then white rows with the report's icon in a pale circle;
       on the right, a card. Ours holds the filters every download and
       preview uses, then the queued exports and the schedules. -->
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <h1 class="text-[24px] font-semibold text-ink">{{ t('reports.title') }}</h1>

    <p v-if="typesError" class="mt-4 text-small text-danger">{{ typesError }}</p>

    <div class="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div class="space-y-7">
        <section v-for="group in groupedTypes" :key="group.key">
          <p class="mb-2 text-[12px] font-semibold uppercase tracking-widest text-ink-faint">{{ t(`reports.groups.${group.key}`) }}</p>
          <div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            <div v-for="type in group.types" :key="type" class="group">
              <div class="flex min-h-[72px] items-center gap-4 px-5 py-3 transition-default hover:bg-surface-2">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-4 text-left" @click="openPreview(type)">
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                    <Icon :name="typeIcon[type] ?? 'file-text'" size="18" />
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-[15px] text-ink">{{ typeLabel(type) }}</span>
                    <span v-if="errors[`${type}:csv`] || errors[`${type}:xlsx`] || errors[`${type}:pdf`]" class="block text-caption text-danger">
                      {{ errors[`${type}:csv`] || errors[`${type}:xlsx`] || errors[`${type}:pdf`] }}
                    </span>
                    <span v-else-if="lastExport[type] && lastExport[type].totalRows !== null && !lastExport[type].truncated" class="block text-caption text-ink-faint">
                      {{ t('reports.exports.complete', { total: formatCount(lastExport[type].totalRows) }) }}
                    </span>
                  </span>
                </button>
                <div class="flex shrink-0 items-center gap-1 opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100">
                  <AppButton
                    v-for="format in FORMATS"
                    :key="format"
                    variant="ghost"
                    size="sm"
                    icon="download"
                    :loading="pending[`${type}:${format}`]"
                    @click="onDownload(type, format)"
                  >
                    {{ format.toUpperCase() }}
                  </AppButton>
                </div>
                <Icon name="chevron-right" size="16" class="shrink-0 text-ink-faint" />
              </div>
              <!-- The cut, said out loud. This is the whole reason the
                   server sends the row counts back: without it the file
                   that just landed in Downloads looks like the complete
                   answer. -->
              <div
                v-if="lastExport[type]?.truncated"
                class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-warning/30 bg-warning-subtle/40 px-5 py-2.5"
              >
                <Icon name="alert-triangle" size="15" class="shrink-0 text-warning" />
                <p class="min-w-0 flex-1 text-caption text-ink">
                  {{ t('reports.exports.truncated', { exported: formatCount(lastExport[type].exportedRows), total: formatCount(lastExport[type].totalRows) }) }}
                </p>
                <AppButton size="sm" :loading="queueing[type]" @click="queueFullExport(type)">{{ t('reports.exports.queueFull') }}</AppButton>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="space-y-4">
        <div class="rounded-xl border border-border bg-surface p-5">
          <p class="text-[16px] font-semibold text-ink">{{ t('common.filter') }}</p>
          <p class="mt-1 text-caption text-ink-muted">{{ t('reports.subtitle') }}</p>
          <FilterBar v-model="filters" class="mt-4" align="end" :fields="filterFields" :clear-label="t('reports.filters.clear')" />
        </div>

    <!-- Queued exports. Only rendered once there is something to show: an
         empty panel on every visit would be noise for the many admins who
         never hit the cap. -->
    <section v-if="jobs.length" class="rounded-xl border border-border bg-surface p-5">
      <h2 class="text-small font-semibold text-ink">{{ t('reports.exports.title') }}</h2>
      <p class="mt-1 text-caption text-ink-faint">{{ t('reports.exports.hint') }}</p>

      <div class="mt-3 space-y-2">
        <AppCard v-for="job in jobs" :key="job.id" padding="sm" class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-small font-medium text-ink">{{ typeLabel(job.type) }}</p>
            <p class="text-caption text-ink-faint">
              {{ job.format.toUpperCase() }} ·
              {{ t('reports.exports.rows', { rows: formatCount(job.rowCount), total: formatCount(job.totalRows) }) }}
            </p>
            <p v-if="job.status === 'FAILED' && job.error" class="text-caption text-danger">{{ job.error }}</p>
            <p v-else-if="job.truncated" class="text-caption text-warning">{{ t('reports.exports.stillCapped') }}</p>
          </div>

          <Badge :variant="statusVariant[job.status]" size="sm" dot>
            {{ t(`reports.exports.status.${job.status}`) }}
          </Badge>

          <AppButton
            v-if="job.status === 'READY'"
            variant="outline"
            size="sm"
            icon="download"
            @click="downloadJob(job)"
          >
            {{ t('reports.exports.download') }}
          </AppButton>
        </AppCard>
      </div>
    </section>

    <!-- Reports that build themselves on a timetable. -->
    <section v-if="canSchedule" class="rounded-xl border border-border bg-surface p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-small font-semibold text-ink">{{ t('reports.schedules.title') }}</h2>
          <p class="mt-1 text-caption text-ink-faint">{{ t('reports.schedules.hint') }}</p>
        </div>
        <AppButton size="sm" icon="plus" :disabled="!types.length" @click="openScheduleModal">
          {{ t('reports.schedules.add') }}
        </AppButton>
      </div>

      <div v-if="schedules.length" class="mt-3 space-y-2">
        <AppCard v-for="schedule in schedules" :key="schedule.id" padding="sm" class="flex flex-wrap items-center gap-3">
          <div class="min-w-[180px] flex-1 basis-full">
            <p class="truncate text-small font-medium text-ink">{{ schedule.name }}</p>
            <p class="text-caption text-ink-faint">
              {{ typeLabel(schedule.type) }} · {{ schedule.format.toUpperCase() }} · {{ cadenceSummary(schedule) }}
            </p>
            <p class="text-caption text-ink-faint">
              {{ t('reports.schedules.nextRun', { at: formatDateTime(schedule.nextRunAt) }) }}
              <span v-if="schedule.lastRunAt"> · {{ t('reports.schedules.lastRun', { at: formatDateTime(schedule.lastRunAt) }) }}</span>
            </p>
            <p v-if="schedule.lastError" class="text-caption text-danger">{{ schedule.lastError }}</p>
          </div>

          <Badge :variant="schedule.active ? 'success' : 'neutral'" size="sm" dot>
            {{ schedule.active ? t('reports.schedules.active') : t('reports.schedules.paused') }}
          </Badge>

          <div class="flex gap-1">
            <AppButton
              variant="ghost"
              size="sm"
              icon="play"
              :loading="runningSchedule[schedule.id]"
              @click="runScheduleNow(schedule)"
            >
              {{ t('reports.schedules.runNow') }}
            </AppButton>
            <AppButton variant="ghost" size="sm" :icon="schedule.active ? 'pause' : 'play'" @click="toggleSchedule(schedule)" />
            <AppButton variant="ghost" size="sm" icon="trash" @click="removeSchedule(schedule)" />
          </div>
        </AppCard>
      </div>

      <p v-else class="mt-3 rounded-lg border border-dashed border-border py-6 text-center text-caption text-ink-faint">
        {{ t('reports.schedules.empty') }}
      </p>
    </section>

      </div>
    </div>

    <Modal v-model="scheduleModal" :title="t('reports.schedules.add')" size="lg">
      <form class="space-y-4" @submit.prevent="saveSchedule">
        <AppInput v-model="scheduleForm.name" required :label="t('reports.schedules.name')" />

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppSelect v-model="scheduleForm.type" :label="t('reports.schedules.type')" :options="scheduleTypeOptions" />
          <AppSelect
            v-model="scheduleForm.format"
            :label="t('reports.schedules.format')"
            :options="[
              { value: 'xlsx', label: 'XLSX' },
              { value: 'csv', label: 'CSV' },
            ]"
          />
          <AppSelect v-model="scheduleForm.cadence" :label="t('reports.schedules.cadenceLabel')" :options="cadenceOptions" />
          <AppSelect v-model.number="scheduleForm.hour" :label="t('reports.schedules.hour')" :options="hourOptions" />
          <AppSelect
            v-if="scheduleForm.cadence === 'WEEKLY'"
            v-model.number="scheduleForm.dayOfWeek"
            :label="t('reports.schedules.dayOfWeek')"
            :options="weekdayOptions"
          />
          <AppSelect
            v-else-if="scheduleForm.cadence === 'MONTHLY'"
            v-model.number="scheduleForm.dayOfMonth"
            :label="t('reports.schedules.dayOfMonth')"
            :options="monthDayOptions"
          />
        </div>

        <div>
          <UserPicker :label="t('reports.schedules.recipients')" :placeholder="t('reports.filters.userPlaceholder')" @select="addRecipient" />
          <p class="mt-1.5 text-caption text-ink-faint">{{ t('reports.schedules.recipientsHint') }}</p>
          <div v-if="scheduleForm.recipients.length" class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="id in scheduleForm.recipients"
              :key="id"
              class="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-caption text-ink"
            >
              {{ recipientNames[id] ?? id }}
              <button type="button" class="text-ink-faint hover:text-danger" @click="removeRecipient(id)">
                <Icon name="close" size="12" />
              </button>
            </span>
          </div>
        </div>

        <p class="rounded-md bg-surface-2 px-3.5 py-2.5 text-caption text-ink-muted">
          {{ t('reports.schedules.filtersNote') }}
        </p>

        <p v-if="scheduleError" class="text-small text-danger">{{ scheduleError }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <AppButton type="button" variant="ghost" @click="scheduleModal = false">{{ t('courses.cancel') }}</AppButton>
          <AppButton type="submit" :loading="scheduleSaving">{{ t('reports.schedules.save') }}</AppButton>
        </div>
      </form>
    </Modal>

    <!-- The report on screen. A modal rather than an inline expansion: the
         table is nine columns wide and would push the filter bar and every
         other report off the top of the viewport. -->
    <Modal v-model="previewOpen" size="xl" :title="preview?.title || t('reports.preview.title')">
      <p v-if="previewError" class="text-small text-danger">{{ previewError }}</p>

      <div v-else-if="previewLoading" class="space-y-2">
        <p class="text-small text-ink-muted">{{ t('reports.preview.loading') }}</p>
      </div>

      <div v-else-if="preview" class="space-y-4">
        <!-- A preview is capped far lower than an export, which is exactly
             the sort of difference that misleads when it is not said. -->
        <p class="text-caption" :class="preview.truncated ? 'text-warning' : 'text-ink-faint'">
          {{
            preview.truncated
              ? t('reports.preview.capped', {
                  shown: formatCount(preview.previewRows),
                  total: formatCount(preview.totalRows),
                })
              : t('reports.preview.all', { total: formatCount(preview.totalRows) })
          }}
        </p>

        <div v-if="chartSeries.length > 1" class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-small font-medium text-ink">{{ t('reports.preview.chart', { count: chartSeries.length }) }}</p>
            <div v-if="chartColumnOptions.length > 1" class="w-56">
              <AppSelect v-model="chartColumn" :options="chartColumnOptions" />
            </div>
          </div>
          <Chart type="bar" :series="chartSeries" height="h-40" />
        </div>

        <div class="max-h-[26rem] overflow-y-auto">
          <DataTable
            :columns="previewColumns"
            :rows="preview.rows"
            empty-icon="file-text"
            :empty-title="t('reports.preview.empty')"
          />
        </div>

        <div class="flex flex-wrap justify-end gap-2">
          <AppButton
            v-for="format in FORMATS"
            :key="format"
            variant="outline"
            size="sm"
            icon="download"
            :loading="pending[`${previewType}:${format}`]"
            @click="onDownload(previewType, format)"
          >
            {{ format.toUpperCase() }}
          </AppButton>
        </div>
      </div>
    </Modal>
  </div>
</template>
