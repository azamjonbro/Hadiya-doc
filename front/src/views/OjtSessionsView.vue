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
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import UserPicker from '@/components/ui/UserPicker.vue'
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

function emptyForm() {
  return { checklistId: '', traineeId: '', traineeName: '', observerId: '', observerName: '', scheduledAt: '', location: '' }
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
        <h1 class="flex items-center gap-2 text-[24px] font-semibold text-ink">
          {{ t('ojt.title') }}
          <span class="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground" :title="t('ojt.sessionsSubtitle')">?</span>
        </h1>
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

    <div v-else class="mt-4 space-y-3">
      <AppCard v-for="session in visibleSessions" :key="session.id" class="p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate font-medium text-ink">{{ session.traineeName }}</p>
              <Badge :variant="statusVariant[session.status]" size="sm">
                {{ t(`ojt.sessionStatus.${session.status}`) }}
              </Badge>
              <Badge v-if="session.outcome" :variant="session.outcome === 'PASS' ? 'success' : 'danger'" size="sm">
                {{ t(`ojt.outcome.${session.outcome}`) }}
              </Badge>
              <Badge v-if="session.signedAt" variant="primary" size="sm">{{ t('ojt.signedShort') }}</Badge>
            </div>

            <p class="mt-1 truncate text-small text-ink-muted">
              {{ session.checklistName }} · {{ t('ojt.versionLabel', { version: session.checklistVersion }) }}
            </p>

            <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-ink-faint">
              <span>
                <Icon name="user" size="11" class="mr-1 inline" />{{ t('ojt.observer') }}: {{ session.observerName }}
              </span>
              <span v-if="session.location">
                <Icon name="map-pin" size="11" class="mr-1 inline" />{{ session.location }}
              </span>
              <span>
                <Icon name="calendar" size="11" class="mr-1 inline" />
                <template v-if="session.completedAt">
                  {{ t('ojt.completedAt') }}: {{ formatDateTime(session.completedAt, locale) }}
                </template>
                <template v-else-if="session.startedAt">
                  {{ t('ojt.startedAt') }}: {{ formatDateTime(session.startedAt, locale) }}
                </template>
                <template v-else>
                  {{ t('ojt.scheduledAt') }}: {{ formatDateTime(session.scheduledAt, locale) }}
                </template>
              </span>
              <span v-if="session.status === 'COMPLETED'">
                {{ t('ojt.percentOfAssessed', { percent: session.score.percent }) }}
              </span>
            </p>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <AppButton
              v-if="session.status === 'SCHEDULED' && isMyObservation(session)"
              size="sm"
              icon="play"
              :loading="starting === session.id"
              @click="start(session)"
            >
              {{ t('ojt.start') }}
            </AppButton>
            <AppButton
              variant="secondary"
              size="sm"
              icon="arrow-right"
              icon-position="right"
              @click="router.push({ name: 'ojt-session', params: { sessionId: session.id } })"
            >
              {{ t('ojt.open') }}
            </AppButton>
          </div>
        </div>
      </AppCard>

      <div v-if="totalPages > 1" class="flex justify-center pt-2">
        <Pagination :page="page" :total-pages="totalPages" @update:page="goToPage" />
      </div>
    </div>

    <Modal v-model="modalOpen" size="md" :title="t('ojt.newSession')">
      <div class="space-y-4">
        <AppSelect
          v-model="form.checklistId"
          :label="t('ojt.checklist')"
          :placeholder="t('ojt.checklist')"
          :options="checklistOptions"
        />
        <p v-if="!checklistOptions.length" class="text-caption text-warning">{{ t('ojt.noActiveChecklists') }}</p>

        <UserPicker
          v-model="form.traineeId"
          :display-name="form.traineeName"
          :label="t('ojt.trainee')"
          @select="(user) => (form.traineeName = user.fullName)"
        />
        <UserPicker
          v-model="form.observerId"
          :display-name="form.observerName"
          :label="t('ojt.observer')"
          @select="(user) => (form.observerName = user.fullName)"
        />

        <AppDatePicker v-model="form.scheduledAt" with-time :label="t('ojt.scheduledAt')" />
        <AppInput v-model="form.location" :label="t('ojt.location')" :hint="t('ojt.locationHint')" />
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="creating" @click="create">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
    </div>
  </div>
</template>
