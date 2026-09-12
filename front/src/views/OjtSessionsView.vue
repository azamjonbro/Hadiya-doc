<script setup>
/**
 * The observer's list: who they are watching, against which standard (13.3).
 *
 * No client-side narrowing. `GET /ojt/sessions` runs behind
 * `scopeToManagedUsers` and the service forces `observerId = me` for anybody
 * without `ojt:manage`, so filtering here would only be able to hide rows
 * the API already decided to show — and would quietly disagree with the
 * server the day that rule changes.
 *
 * Scheduling is `ojt:manage` and starting is `ojt:observe`; both controls
 * are gated on the same permission the route checks, so nothing on screen
 * is an offer the API will refuse.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ojtApi } from '@/services/ojt'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import UserPicker from '@/components/ui/UserPicker.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Icon from '@/components/ui/Icon.vue'
import SearchField from '@/components/portal/SearchField.vue'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const canManage = computed(() => auth.hasPermission('ojt:manage'))

const sessions = ref([])
const loading = ref(true)
const page = ref(1)
const limit = 25
const total = ref(0)
const status = ref('')
const scope = ref('')
const starting = ref('')

const modalOpen = ref(false)
const creating = ref(false)
const checklists = ref([])
const form = ref(emptyForm())

// The reference's wizard (rasm): participants → observation sheet → date.
// The observer is the person scheduling, until they say otherwise; the
// date defaults to tomorrow 08:00 so a session is one click from ready.
const step = ref(0)
const STEPS = ['participants', 'checklist', 'when']
const pickingObserver = ref(false)
const pickingTrainee = ref(false)

function tomorrowAtEight() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`
}

function emptyForm() {
  return {
    checklistId: '',
    traineeId: '',
    traineeName: '',
    observerId: auth.user?.id ?? '',
    observerName: auth.user?.fullName ?? '',
    scheduledAt: tomorrowAtEight(),
    location: '',
  }
}

const stepDone = computed(() => [
  Boolean(form.value.traineeId && form.value.observerId),
  Boolean(form.value.checklistId),
  Boolean(form.value.scheduledAt),
])
const canNext = computed(() => stepDone.value[step.value])
const chosenChecklist = computed(() => checklists.value.find((c) => c.id === form.value.checklistId) ?? null)

function next() {
  if (!canNext.value) return
  if (step.value < STEPS.length - 1) step.value += 1
  else create()
}

// The day and month a session sits on: what was recorded when it was
// completed, when it started otherwise, when it is planned failing that.
function sessionDate(session) {
  return new Date(session.completedAt ?? session.startedAt ?? session.scheduledAt)
}
const dayOf = (session) => sessionDate(session).getDate()
const monthOf = (session) => sessionDate(session).toLocaleDateString(locale.value, { month: 'short' })
function timeOf(session) {
  const start = sessionDate(session)
  const end = session.completedAt && session.startedAt ? new Date(session.completedAt) : null
  const fmt = (d) => d.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
  const day = start.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
  return end ? t('ojt.timeRange', { from: `${day}, ${fmt(new Date(session.startedAt))}`, to: fmt(end) }) : `${day}, ${fmt(start)}`
}

const statusOptions = computed(() =>
  ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((value) => ({
    value,
    label: t(`ojt.sessionStatus.${value}`),
  }))
)

const scopeOptions = computed(() => [
  { value: '', label: t('ojt.everyone') },
  { value: 'true', label: t('ojt.onlyMine') },
])

const checklistOptions = computed(() =>
  checklists.value.map((checklist) => ({ value: checklist.id, label: checklist.name }))
)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const statusVariant = {
  SCHEDULED: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

const isMyObservation = (session) => session.observerId === auth.user?.id

// Portal §6: the segment splits the page by which side of the clipboard
// the person is on. Both halves come from the same list — the server
// already narrows it to sessions the caller is part of — so the switch
// is client-side, as is the search box next to it.
const side = ref('observer') // observer | trainee
const search = ref('')
const filtersOpen = ref(false)
const visibleSessions = computed(() => {
  const me = auth.user?.id
  const q = search.value.trim().toLowerCase()
  return sessions.value.filter((session) => {
    if (!canManage.value || scope.value === 'true') {
      if (side.value === 'observer' && session.observerId !== me) return false
      if (side.value === 'trainee' && session.traineeId !== me) return false
    }
    if (q && !`${session.traineeName} ${session.observerName} ${session.checklistName}`.toLowerCase().includes(q)) return false
    return true
  })
})
function clearFilters() {
  status.value = ''
  search.value = ''
  applyFilter()
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, limit }
    if (status.value) params.status = status.value
    // Sent only when asked for: the server already forces "mine" on anybody
    // who cannot manage, and sending mine=false would read as a request to
    // widen a list this caller was never allowed to widen.
    if (scope.value === 'true') params.mine = 'true'
    const result = await ojtApi.sessions(params)
    sessions.value = result.items
    total.value = result.total
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.loadError')))
  } finally {
    loading.value = false
  }
}

function goToPage(value) {
  page.value = value
  load()
}

function applyFilter() {
  page.value = 1
  load()
}

async function start(session) {
  starting.value = session.id
  try {
    const updated = await ojtApi.startSession(session.id)
    sessions.value = sessions.value.map((row) => (row.id === session.id ? { ...row, ...updated } : row))
    toast.success(t('ojt.sessionStarted'))
    router.push({ name: 'ojt-session', params: { sessionId: session.id } })
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    starting.value = ''
  }
}

async function openCreate() {
  form.value = emptyForm()
  step.value = 0
  pickingObserver.value = false
  pickingTrainee.value = false
  modalOpen.value = true
  try {
    // Only ACTIVE ones: the server refuses to schedule against a draft or an
    // archived list, so offering them would be an offer it will not honour.
    checklists.value = await ojtApi.checklists({ status: 'ACTIVE' })
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.loadError')))
  }
}

async function create() {
  if (!form.value.checklistId || !form.value.traineeId || !form.value.observerId) {
    toast.error(t('ojt.createRequired'))
    return
  }
  creating.value = true
  try {
    const payload = {
      checklistId: form.value.checklistId,
      traineeId: form.value.traineeId,
      observerId: form.value.observerId,
      location: form.value.location.trim(),
    }
    if (form.value.scheduledAt) payload.scheduledAt = form.value.scheduledAt
    await ojtApi.createSession(payload)
    modalOpen.value = false
    toast.success(t('ojt.sessionCreated'))
    page.value = 1
    await load()
  } catch (error) {
    // The server is the one that knows "the observer cannot be the trainee"
    // and "this checklist has no items"; its sentence is the useful one.
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-surface pb-12">
    <div class="mx-auto w-full max-w-[840px] px-4 pt-10">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-[24px] font-semibold text-ink">{{ t('ojt.title') }}</h1>
          <p class="mt-1 text-[13px] text-ink-muted">{{ t('ojt.subtitleHint') }}</p>
        </div>
        <AppButton v-if="canManage" icon="plus" size="sm" @click="openCreate">{{ t('ojt.newSession') }}</AppButton>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex rounded-lg bg-surface-2 p-0.5">
          <button
            type="button"
            class="h-8 rounded-md px-3 text-[13px] transition-default"
            :class="side === 'observer' ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted'"
            @click="side = 'observer'"
          >{{ t('portal.ojt.iObserve') }}</button>
          <button
            type="button"
            class="h-8 rounded-md px-3 text-[13px] transition-default"
            :class="side === 'trainee' ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted'"
            @click="side = 'trainee'"
          >{{ t('portal.ojt.iAmObserved') }}</button>
        </div>
        <div class="flex items-center gap-2">
          <SearchField v-model="search" width="w-[150px]" />
          <button
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-[13px] text-ink hover:bg-surface-2"
            :class="filtersOpen || status ? 'bg-surface-2' : ''"
            @click="filtersOpen = !filtersOpen"
          >
            <Icon name="filter" size="14" />
            {{ t('portal.ojt.filter') }}
          </button>
        </div>
      </div>

      <div v-if="filtersOpen" class="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
        <AppSelect
          v-model="status"
          class="w-44"
          :aria-label="t('ojt.statusLabel')"
          :placeholder="t('ojt.allStatuses')"
          :options="statusOptions"
          @update:model-value="applyFilter"
        />
        <AppSelect
          v-if="canManage"
          v-model="scope"
          class="w-40"
          :aria-label="t('ojt.scopeLabel')"
          :options="scopeOptions"
          @update:model-value="applyFilter"
        />
      </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 4" :key="n" class="h-24 w-full rounded-lg" />
    </div>

    <div v-else-if="!visibleSessions.length" class="mt-16 flex flex-col items-center text-center">
      <span class="flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 text-ink-faint"><Icon name="briefcase" size="32" /></span>
      <p class="mt-4 text-[14px] font-semibold text-ink">{{ sessions.length ? t('portal.ojt.nothingFound') : t('ojt.emptySessions') }}</p>
      <p class="mt-1 text-[13px] text-ink-muted">{{ sessions.length || status || search ? t('portal.ojt.tryOtherSearch') : t('ojt.emptySessionsHint') }}</p>
      <AppButton v-if="status || search" class="mt-4" size="sm" variant="secondary" @click="clearFilters">{{ t('portal.ojt.clearFilters') }}</AppButton>
    </div>

    <div v-else class="mt-4 divide-y divide-border border-t border-border">
      <!-- The reference's row: the day in a grey block, then status, time
           and the checklist, then who is observed and by whom. -->
      <div
        v-for="session in visibleSessions"
        :key="session.id"
        class="flex cursor-pointer flex-wrap items-start gap-4 py-4 transition-default hover:bg-surface-2 sm:flex-nowrap"
        @click="router.push({ name: 'ojt-session', params: { sessionId: session.id } })"
      >
        <div class="flex h-[78px] w-[78px] shrink-0 flex-col items-center justify-center rounded-lg bg-surface-2">
          <span class="text-[26px] font-semibold leading-none text-ink">{{ dayOf(session) }}</span>
          <span class="mt-1 text-[12px] text-ink-muted">{{ monthOf(session) }}</span>
        </div>

        <div class="min-w-0 flex-1 sm:w-[240px] sm:flex-none">
          <div class="flex flex-wrap items-center gap-1.5">
            <Badge :variant="statusVariant[session.status]" size="sm" dot>{{ t(`ojt.sessionStatus.${session.status}`) }}</Badge>
            <Badge v-if="session.outcome" :variant="session.outcome === 'PASS' ? 'success' : 'danger'" size="sm">{{ t(`ojt.outcome.${session.outcome}`) }}</Badge>
            <Badge v-if="session.signedAt" variant="primary" size="sm">{{ t('ojt.signedShort') }}</Badge>
          </div>
          <p class="mt-2 flex items-center gap-1.5 text-[13px] text-ink-muted"><Icon name="clock" size="13" class="shrink-0" /> <span class="truncate">{{ timeOf(session) }}</span></p>
          <p class="mt-1 flex items-center gap-1.5 text-[13px] text-ink"><Icon name="check-square" size="13" class="shrink-0 text-ink-faint" /> <span class="truncate">{{ session.checklistName }}</span></p>
          <p v-if="session.status === 'COMPLETED'" class="mt-1 text-caption text-ink-faint">{{ t('ojt.percentOfAssessed', { percent: session.score.percent }) }}</p>
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{{ t('ojt.columns.employee') }}</p>
          <div class="mt-2 flex items-center gap-2.5">
            <Avatar :name="session.traineeName" :src="session.traineeAvatar" size="sm" />
            <div class="min-w-0">
              <p class="truncate text-[14px] font-medium uppercase text-ink">{{ session.traineeName }}</p>
              <p class="truncate text-caption text-ink-muted">{{ session.traineeDepartment || session.location || '—' }}</p>
            </div>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{{ t('ojt.columns.observer') }}</p>
          <div class="mt-2 flex items-center gap-2.5">
            <Avatar :name="session.observerName" :src="session.observerAvatar" size="sm" />
            <div class="min-w-0">
              <p class="truncate text-[14px] font-medium uppercase text-ink">{{ session.observerName }}</p>
              <p class="truncate text-caption text-ink-muted">{{ session.observerDepartment || '—' }}</p>
            </div>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2 self-center" @click.stop>
          <AppButton
            v-if="session.status === 'SCHEDULED' && isMyObservation(session)"
            size="sm"
            icon="play"
            :loading="starting === session.id"
            @click="start(session)"
          >
            {{ t('ojt.start') }}
          </AppButton>
          <Icon v-else name="chevron-right" size="16" class="text-ink-faint" />
        </div>
      </div>

      <div v-if="totalPages > 1" class="flex justify-center pt-4">
        <Pagination :page="page" :total-pages="totalPages" @update:page="goToPage" />
      </div>
    </div>

    <Modal v-model="modalOpen" size="lg">
      <!-- rasm: the stepper down the left, one question on the right -->
      <div class="grid grid-cols-1 sm:grid-cols-[250px_minmax(0,1fr)]">
        <ol class="border-b border-border px-4 pb-6 sm:border-b-0 sm:border-r sm:pr-6">
          <li v-for="(key, index) in STEPS" :key="key" class="relative flex items-start gap-3.5 pb-8 last:pb-0">
            <span v-if="index < STEPS.length - 1" class="absolute left-[25px] top-[52px] h-[calc(100%-52px)] w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              class="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 bg-surface transition-default"
              :class="step === index ? 'border-primary text-primary' : stepDone[index] ? 'border-success text-success' : 'border-border text-ink-faint'"
              :disabled="index > step && !stepDone[index - 1]"
              @click="step = index"
            >
              <Icon :name="index === 0 ? 'users' : index === 1 ? 'check-square' : 'calendar'" size="22" />
            </button>
            <div class="pt-3.5">
              <p class="text-[15px]" :class="step === index ? 'font-semibold text-primary' : 'text-ink'">{{ t(`ojt.wizard.${key === 'checklist' ? 'checklistStep' : key}`) }}</p>
              <p v-if="index === 1 && chosenChecklist" class="mt-0.5 text-caption text-ink-muted">{{ chosenChecklist.name }}</p>
              <p v-if="index === 2 && form.scheduledAt" class="mt-0.5 text-caption text-ink-muted">{{ formatDateTime(form.scheduledAt, locale) }}</p>
            </div>
          </li>
        </ol>

        <div class="flex min-h-[340px] flex-col px-4 sm:pl-8">
          <!-- Step 1: participants -->
          <template v-if="step === 0">
            <h3 class="text-[20px] font-semibold text-ink">{{ t('ojt.wizard.participants') }}</h3>
            <div class="mt-8 grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 gap-y-6">
              <span class="text-[14px] text-ink">{{ t('ojt.wizard.observerLabel') }}:</span>
              <div v-if="pickingObserver">
                <UserPicker :display-name="form.observerName" :placeholder="t('ojt.wizard.pickObserver')" @select="(u) => { form.observerId = u.id; form.observerName = u.fullName; pickingObserver = false }" @clear="form.observerId = ''" />
              </div>
              <button v-else type="button" class="flex items-center gap-2 text-left" @click="pickingObserver = true">
                <Avatar :name="form.observerName" :src="form.observerId === auth.user?.id ? auth.user?.avatar : ''" size="sm" />
                <span class="text-[14px] text-ink">{{ form.observerName }} <span v-if="form.observerId === auth.user?.id" class="text-ink-muted">{{ t('ojt.wizard.you') }}</span></span>
                <Icon name="chevron-down" size="14" class="text-ink-faint" />
              </button>

              <span class="text-[14px] text-ink">{{ t('ojt.wizard.employee') }}:</span>
              <div v-if="pickingTrainee || !form.traineeId">
                <UserPicker v-if="pickingTrainee" :display-name="form.traineeName" :placeholder="t('ojt.wizard.pickEmployee')" @select="(u) => { form.traineeId = u.id; form.traineeName = u.fullName; pickingTrainee = false }" @clear="form.traineeId = ''" />
                <button v-else type="button" class="flex items-center gap-2 text-[14px] text-primary hover:underline" @click="pickingTrainee = true">
                  <Icon name="user-plus" size="16" /> {{ t('ojt.wizard.pickEmployee') }}
                </button>
              </div>
              <button v-else type="button" class="flex items-center gap-2 text-left" @click="pickingTrainee = true">
                <Avatar :name="form.traineeName" size="sm" />
                <span class="text-[14px] text-ink">{{ form.traineeName }}</span>
                <span class="text-caption text-primary">{{ t('ojt.wizard.changeEmployee') }}</span>
              </button>
            </div>
          </template>

          <!-- Step 2: which checklist -->
          <template v-else-if="step === 1">
            <h3 class="text-[20px] font-semibold text-ink">{{ t('ojt.wizard.checklistStep') }}</h3>
            <p class="mt-1 text-[13px] text-ink-muted">{{ t('ojt.wizard.checklistHint') }}</p>
            <p v-if="!checklistOptions.length" class="mt-6 text-caption text-warning">{{ t('ojt.noActiveChecklists') }}</p>
            <ul v-else class="mt-6 space-y-2">
              <li v-for="checklist in checklists" :key="checklist.id">
                <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-default" :class="form.checklistId === checklist.id ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-surface-2'">
                  <input v-model="form.checklistId" type="radio" :value="checklist.id" class="mt-1 accent-primary" />
                  <span class="min-w-0">
                    <span class="block text-[14px] font-medium text-ink">{{ checklist.name }}</span>
                    <span class="block text-caption text-ink-muted">{{ [checklist.position, checklist.department].filter(Boolean).join(' · ') || t('ojt.itemsCount', { count: checklist.items?.length ?? 0 }) }}</span>
                  </span>
                </label>
              </li>
            </ul>
          </template>

          <!-- Step 3: when and where -->
          <template v-else>
            <h3 class="text-[20px] font-semibold text-ink">{{ t('ojt.wizard.when') }}</h3>
            <p class="mt-1 text-[13px] text-ink-muted">{{ t('ojt.wizard.whenHint') }}</p>
            <div class="mt-6 max-w-sm space-y-4">
              <AppDatePicker v-model="form.scheduledAt" with-time :label="t('ojt.scheduledAt')" />
              <AppInput v-model="form.location" :label="t('ojt.location')" :hint="t('ojt.locationHint')" />
            </div>
          </template>

          <div class="mt-auto flex items-center justify-end gap-2 pt-8">
            <AppButton v-if="step > 0" variant="ghost" @click="step -= 1">{{ t('ojt.wizard.back') }}</AppButton>
            <AppButton :disabled="!canNext" :loading="creating" icon="chevron-right" icon-position="right" @click="next">
              {{ step === STEPS.length - 1 ? t('ojt.wizard.create') : t('ojt.wizard.next') }}
            </AppButton>
          </div>
        </div>
      </div>
    </Modal>
    </div>
  </div>
</template>
