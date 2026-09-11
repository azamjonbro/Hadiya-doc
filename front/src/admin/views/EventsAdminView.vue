<script setup>
/**
 * Running events: creating them, changing them, and marking who turned up.
 *
 * PATCH and DELETE have existed on the API since before 6.1 with no screen
 * to reach them (§1.14), which is why an event could be created and then
 * never corrected. The edit form is the point of this page as much as the
 * attendance sheet is.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventsApi } from '@/services/events'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const TYPES = ['MEETING', 'TRAINING', 'SEMINAR', 'EVENT', 'ANNOUNCEMENT']
const MODES = ['OFFLINE', 'ONLINE', 'HYBRID']
// The offsets people actually ask for, rather than a free-text field that
// invites "90".
const REMINDER_OFFSETS = [
  { value: 10080, key: 'week' },
  { value: 1440, key: 'day' },
  { value: 60, key: 'hour' },
  { value: 15, key: 'quarter' },
]

const items = ref([])
const loading = ref(true)

const editorOpen = ref(false)
const saving = ref(false)
const draft = reactive({
  id: null,
  title: '',
  description: '',
  type: 'TRAINING',
  startAt: '',
  endAt: '',
  location: '',
  mode: 'OFFLINE',
  meeting: { provider: '', url: '', meetingId: '', passcode: '' },
  capacity: 0,
  requiresRegistration: false,
  remindBeforeMinutes: [],
  cancelReason: '',
})

const sheetOpen = ref(false)
const sheetEvent = ref(null)
const sheetRows = ref([])
const sheetLoading = ref(false)
const attendance = ref({})

const search = ref('')
const typeFilter = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return items.value.filter((event) => (!typeFilter.value || event.type === typeFilter.value) && (!q || event.title.toLowerCase().includes(q)))
})
const upcoming = computed(() => filtered.value.filter((event) => new Date(event.endAt) >= new Date()))
const past = computed(() => filtered.value.filter((event) => new Date(event.endAt) < new Date()))

function formatWhen(value) {
  return new Date(value).toLocaleString(locale.value, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  // The date picker takes a local "YYYY-MM-DDTHH:mm"; an ISO string with a
  // Z would be read as local and shift the event by the offset.
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Rasn 4: the month grid. Monday-first, six rows so the grid never
// jumps between months; events keyed by local calendar day.
const view = ref('month')
const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const monthLabel = computed(() => cursor.value.toLocaleDateString(locale.value, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => {
  const monday = new Date(2024, 0, 1) // a Monday
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400e3).toLocaleDateString(locale.value, { weekday: 'short' }))
})
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const monthCells = computed(() => {
  const first = cursor.value
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  const byDay = new Map()
  for (const event of filtered.value) {
    const key = dayKey(new Date(event.startAt))
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(event)
  }
  const todayKey = dayKey(new Date())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = dayKey(date)
    return { key, day: date.getDate(), inMonth: date.getMonth() === first.getMonth(), today: key === todayKey, events: byDay.get(key) ?? [] }
  })
})
function shiftMonth(delta) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
}
function goToday() {
  cursor.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
}
function timeOf(value) {
  return new Date(value).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
}

async function load() {
  loading.value = true
  try {
    items.value = await eventsApi.calendar({})
  } catch (error) {
    toast.error(apiErrorText(error, t('events.loadError')))
  } finally {
    loading.value = false
  }
}

function openNew() {
  Object.assign(draft, {
    id: null,
    title: '',
    description: '',
    type: 'TRAINING',
    startAt: '',
    endAt: '',
    location: '',
    mode: 'OFFLINE',
    meeting: { provider: '', url: '', meetingId: '', passcode: '' },
    capacity: 0,
    requiresRegistration: false,
    remindBeforeMinutes: [],
    cancelReason: '',
  })
  editorOpen.value = true
}

async function openEdit(event) {
  // The read comes first and used to be unguarded, so a failure here left
  // the pencil doing nothing at all: no modal, no message. An edit button
  // that silently declines to open is indistinguishable from a dead one.
  let full
  try {
    full = await eventsApi.getById(event.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('events.loadFailed')))
    return
  }
  Object.assign(draft, {
    id: full.id,
    title: full.title,
    description: full.description ?? '',
    type: full.type,
    startAt: toLocalInput(full.startAt),
    endAt: toLocalInput(full.endAt),
    location: full.location ?? '',
    mode: full.mode ?? 'OFFLINE',
    meeting: { provider: '', url: '', meetingId: '', passcode: '', ...(full.meeting ?? {}) },
    capacity: full.capacity ?? 0,
    requiresRegistration: full.requiresRegistration ?? false,
    remindBeforeMinutes: full.remindBeforeMinutes ?? [],
    cancelReason: '',
  })
  editorOpen.value = true
}

function toggleReminder(value) {
  const index = draft.remindBeforeMinutes.indexOf(value)
  if (index === -1) draft.remindBeforeMinutes.push(value)
  else draft.remindBeforeMinutes.splice(index, 1)
}

async function save() {
  if (!draft.title.trim() || !draft.startAt || !draft.endAt) {
    toast.error(t('events.requiredFields'))
    return
  }
  saving.value = true
  try {
    const payload = {
      title: draft.title.trim(),
      description: draft.description,
      type: draft.type,
      startAt: new Date(draft.startAt).toISOString(),
      endAt: new Date(draft.endAt).toISOString(),
      location: draft.location,
      mode: draft.mode,
      meeting: draft.meeting,
      capacity: Number(draft.capacity) || 0,
      requiresRegistration: draft.requiresRegistration,
      remindBeforeMinutes: draft.remindBeforeMinutes,
    }
    if (draft.id) await eventsApi.update(draft.id, payload)
    else await eventsApi.create(payload)
    // Changing the time notifies every participant, so it is worth saying
    // that it happened rather than just closing the dialog.
    toast.success(draft.id ? t('events.savedAndNotified') : t('events.created'))
    editorOpen.value = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('events.saveError')))
  } finally {
    saving.value = false
  }
}

async function cancelEvent(event) {
  const ok = await confirm({
    title: t('events.cancelEventTitle'),
    message: t('events.cancelEventMessage', { title: event.title }),
  })
  if (!ok) return
  try {
    await eventsApi.update(event.id, { status: 'CANCELLED', cancelReason: '' })
    toast.success(t('events.cancelledAndNotified'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('events.saveError')))
  }
}

async function openSheet(event) {
  sheetEvent.value = event
  sheetOpen.value = true
  sheetLoading.value = true
  attendance.value = {}
  try {
    sheetRows.value = await eventsApi.registrations(event.id)
    for (const row of sheetRows.value) {
      // Pre-filled from what is already recorded, so reopening the sheet
      // does not silently reset everybody to "absent".
      attendance.value[row.userId] = row.status === 'ATTENDED'
    }
  } catch (error) {
    toast.error(apiErrorText(error, t('events.loadError')))
  } finally {
    sheetLoading.value = false
  }
}

async function saveAttendance() {
  try {
    const entries = sheetRows.value
      // Only people who hold a seat — somebody still in the queue was never
      // let in, and marking them absent would be a false record.
      .filter((row) => ['REGISTERED', 'ATTENDED', 'NO_SHOW'].includes(row.status))
      .map((row) => ({ userId: row.userId, attended: Boolean(attendance.value[row.userId]) }))
    await eventsApi.markAttendance(sheetEvent.value.id, entries)
    toast.success(t('events.attendanceSaved'))
    sheetOpen.value = false
  } catch (error) {
    toast.error(apiErrorText(error, t('events.saveError')))
  }
}

const statusVariant = {
  REGISTERED: 'info',
  WAITLIST: 'warning',
  ATTENDED: 'success',
  NO_SHOW: 'danger',
  CANCELLED: 'neutral',
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1600px] px-6 py-6 lg:px-8">
    <!-- Rasn 4: title, "New event" on the right; a filter card (search,
         type); then the month grid with Today · ‹ month › · Month/List -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-[24px] font-semibold text-ink">{{ t('events.adminTitle') }}</h1>
      <AppButton icon="plus" @click="openNew">{{ t('events.newEvent') }}</AppButton>
    </div>

    <div class="mt-5 rounded-xl border border-border">
      <div class="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
        <div class="w-64">
          <AppInput v-model="search" icon="search" :placeholder="t('common.search')" />
        </div>
        <div class="w-52">
          <AppSelect v-model="typeFilter" :placeholder="t('events.type')" :options="[{ value: '', label: t('common.all') }, ...TYPES.map((value) => ({ value, label: t('eventTypes.' + value) }))]" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <button type="button" class="text-[14px] text-ink hover:text-primary" @click="goToday">{{ t('portal.news.today') }}</button>
        <div class="flex items-center gap-4">
          <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" :aria-label="t('a11y.previousPage')" @click="shiftMonth(-1)"><Icon name="chevron-left" size="18" /></button>
          <p class="min-w-[180px] text-center text-[18px] font-medium text-ink">{{ monthLabel }}</p>
          <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" :aria-label="t('a11y.nextPage')" @click="shiftMonth(1)"><Icon name="chevron-right" size="18" /></button>
        </div>
        <div class="flex items-center gap-5 text-[14px]">
          <button type="button" :class="view === 'month' ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink'" @click="view = 'month'">{{ t('events.views.month') }}</button>
          <button type="button" :class="view === 'list' ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink'" @click="view = 'list'">{{ t('events.views.list') }}</button>
        </div>
      </div>

      <div v-if="loading" class="p-5"><Skeleton class="h-96 w-full rounded-lg" /></div>

      <!-- Month grid: Monday first, 6 rows, the other months' days greyed,
           today on a green disc, the cell of today tinted -->
      <div v-else-if="view === 'month'" class="border-t border-border">
        <div class="grid grid-cols-7 border-b border-border text-center text-[13px] text-ink-muted">
          <div v-for="d in weekdays" :key="d" class="border-r border-border py-2 last:border-r-0">{{ d }}</div>
        </div>
        <div class="grid grid-cols-7">
          <div
            v-for="cell in monthCells"
            :key="cell.key"
            class="min-h-[120px] border-b border-r border-border p-2 text-right [&:nth-child(7n)]:border-r-0"
            :class="cell.today ? 'bg-surface-2' : ''"
          >
            <span
              class="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[14px]"
              :class="cell.today ? 'bg-primary font-semibold text-primary-foreground' : cell.inMonth ? 'text-ink' : 'text-ink-faint'"
            >{{ cell.day }}</span>
            <ul class="mt-1 space-y-1 text-left">
              <li v-for="event in cell.events" :key="event.id">
                <button
                  type="button"
                  class="block w-full truncate rounded px-1.5 py-0.5 text-left text-[12px] transition-default"
                  :class="event.status === 'CANCELLED' ? 'bg-surface-2 text-ink-faint line-through' : 'bg-primary-subtle text-primary hover:bg-primary hover:text-primary-foreground'"
                  :title="event.title"
                  @click="openEdit(event)"
                >
                  {{ timeOf(event.startAt) }} {{ event.title }}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- List: the two groups as before -->
      <div v-else class="border-t border-border px-5 py-4">
        <EmptyState v-if="!filtered.length" icon="calendar" :title="t('events.empty')" :description="t('events.adminEmptyHint')" />
        <template v-else>
          <section v-for="group in [{ key: 'upcoming', rows: upcoming }, { key: 'past', rows: past }]" :key="group.key">
            <h2 v-if="group.rows.length" class="mb-3 mt-4 text-[16px] font-medium text-ink">{{ t(`events.${group.key}`) }}</h2>
            <div class="divide-y divide-border">
              <div v-for="event in group.rows" :key="event.id" class="flex flex-wrap items-center justify-between gap-4 py-4">
                <div class="min-w-0 flex-1">
                  <div class="mb-1 flex flex-wrap items-center gap-2">
                    <p class="truncate text-[15px] font-medium text-ink">{{ event.title }}</p>
                    <Badge variant="neutral" size="sm">{{ t('eventTypes.' + event.type) }}</Badge>
                    <Badge v-if="event.status === 'CANCELLED'" variant="danger" size="sm">{{ t('events.cancelled') }}</Badge>
                    <Badge v-if="event.mode !== 'OFFLINE'" variant="info" size="sm">{{ t(`events.mode.${event.mode}`) }}</Badge>
                  </div>
                  <p class="flex flex-wrap items-center gap-x-3 text-small text-ink-muted">
                    <span>{{ formatWhen(event.startAt) }}</span>
                    <span v-if="event.location">· {{ event.location }}</span>
                    <span v-if="event.requiresRegistration">
                      · {{ event.capacity ? t('events.seats', { taken: event.registeredCount, total: event.capacity }) : t('events.registeredCount', { count: event.registeredCount }) }}
                    </span>
                  </p>
                </div>
                <div class="flex shrink-0 gap-2">
                  <AppButton v-if="event.requiresRegistration" variant="secondary" size="sm" icon="users" @click="openSheet(event)">{{ t('events.attendance') }}</AppButton>
                  <AppButton variant="ghost" size="sm" icon="pencil" @click="openEdit(event)" />
                  <AppButton v-if="event.status !== 'CANCELLED'" variant="ghost" size="sm" icon="close" @click="cancelEvent(event)" />
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>

    <!-- Editor: a page of its own, not a dialog (rasn 5) — a back arrow,
         the title, then labels in a 200px column beside their fields and
         the Create/Save button at the top right of the card -->
    <div v-if="editorOpen" class="fixed inset-x-0 bottom-0 top-16 z-20 overflow-y-auto bg-surface-2 lg:left-14">
      <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
        <div class="flex items-center gap-4">
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('common.back')" @click="editorOpen = false">
            <Icon name="arrow-left" size="20" />
          </button>
          <h1 class="text-[24px] font-semibold text-ink">{{ draft.id ? t('events.editEvent') : t('events.newEvent') }}</h1>
        </div>
        <div class="mt-4 rounded-2xl bg-surface p-8 shadow-sm">
          <div class="flex items-center justify-between gap-4">
            <p class="text-[15px] text-ink">{{ t('events.adminSubtitle') }}</p>
            <AppButton :loading="saving" @click="save">{{ draft.id ? t('common.save') : t('common.create') }}</AppButton>
          </div>
          <div class="mt-6 grid max-w-[1000px] grid-cols-1 items-center gap-x-6 gap-y-5 sm:grid-cols-[220px_minmax(0,1fr)]">
            <label class="text-[15px] text-ink">* {{ t('courses.fields.title') }}:</label>
            <AppInput v-model="draft.title" required />

            <label class="text-[15px] text-ink">{{ t('events.type') }}:</label>
            <div class="flex items-center gap-3">
              <AppSelect v-model="draft.type" class="w-72" :options="TYPES.map((value) => ({ value, label: t('eventTypes.' + value) }))" />
              <AppSelect v-model="draft.mode" class="w-56" :options="MODES.map((value) => ({ value, label: t(`events.mode.${value}`) }))" />
            </div>

            <label class="text-[15px] text-ink">{{ t('events.startAt') }}:</label>
            <div class="flex flex-wrap items-center gap-3">
              <AppDatePicker v-model="draft.startAt" with-time class="w-64" required />
              <span class="text-ink-muted">—</span>
              <AppDatePicker v-model="draft.endAt" with-time class="w-64" required />
            </div>

            <label class="self-start pt-2 text-[15px] text-ink">{{ t('courses.fields.description') }}:</label>
            <textarea v-model="draft.description" rows="3" class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15" />

            <template v-if="draft.mode !== 'ONLINE'">
              <label class="text-[15px] text-ink">{{ t('events.location') }}:</label>
              <AppInput v-model="draft.location" :placeholder="t('events.location')" />
            </template>

            <label class="text-[15px] text-ink">{{ t('events.capacity') }}:</label>
            <div class="flex items-center gap-3">
              <AppInput v-model="draft.capacity" type="number" class="w-28" :disabled="!draft.requiresRegistration" />
              <label class="flex items-center gap-2 text-small text-ink">
                <input v-model="draft.requiresRegistration" type="checkbox" class="h-4 w-4 rounded border-border-strong" />
                {{ t('events.requiresRegistration') }}
              </label>
            </div>

            <template v-if="draft.mode !== 'OFFLINE'">
              <label class="text-[15px] text-ink">{{ t('events.meetingUrl') }}:</label>
              <AppInput v-model="draft.meeting.url" />
              <label class="text-[15px] text-ink">{{ t('events.meetingId') }}:</label>
              <div class="flex gap-3">
                <AppInput v-model="draft.meeting.meetingId" class="flex-1" />
                <AppInput v-model="draft.meeting.passcode" class="w-48" :placeholder="t('events.passcode')" />
              </div>
            </template>

            <label class="text-[15px] text-ink">{{ t('events.reminders') }}:</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="offset in REMINDER_OFFSETS"
                :key="offset.value"
                type="button"
                class="rounded-full border px-3 py-1 text-caption transition-default"
                :class="draft.remindBeforeMinutes.includes(offset.value) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-ink-muted hover:bg-surface-hover'"
                @click="toggleReminder(offset.value)"
              >
                {{ t(`events.remind.${offset.key}`) }}
              </button>
            </div>
          </div>
          <p v-if="draft.id" class="mt-6 text-caption text-ink-faint">{{ t('events.editNotifyHint') }}</p>
        </div>
      </div>
    </div>

    <!-- Attendance sheet -->
    <Modal v-model="sheetOpen" :title="t('events.attendance')" size="lg">
      <div v-if="sheetLoading" class="space-y-2">
        <Skeleton v-for="n in 4" :key="n" class="h-10 w-full rounded-lg" />
      </div>
      <EmptyState
        v-else-if="!sheetRows.length"
        class="py-6"
        icon="users"
        :title="t('events.nobodyRegistered')"
        :description="t('events.nobodyRegisteredHint')"
      />
      <div v-else class="max-h-96 space-y-1 overflow-y-auto">
        <div
          v-for="row in sheetRows"
          :key="row.userId"
          class="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-surface-hover"
        >
          <div class="min-w-0">
            <p class="truncate text-small text-ink">{{ row.fullName }}</p>
            <p class="text-caption text-ink-faint">
              {{ row.department || '—' }}
              <template v-if="row.status === 'WAITLIST'"> · {{ t('events.queuePosition', { position: row.waitlistPosition }) }}</template>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            <Badge :variant="statusVariant[row.status]" size="sm">{{ t(`events.regStatus.${row.status}`) }}</Badge>
            <!-- Only people who held a seat can be marked: somebody still
                 in the queue was never let in, and recording them absent
                 would be a false record. -->
            <label v-if="row.status !== 'WAITLIST'" class="flex items-center gap-1.5 text-caption text-ink">
              <input v-model="attendance[row.userId]" type="checkbox" class="h-4 w-4 rounded border-border-strong" />
              {{ t('events.wasThere') }}
            </label>
          </div>
        </div>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="sheetOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :disabled="!sheetRows.length" @click="saveAttendance">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
