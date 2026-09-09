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

const upcoming = computed(() => items.value.filter((event) => new Date(event.endAt) >= new Date()))
const past = computed(() => items.value.filter((event) => new Date(event.endAt) < new Date()))

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
  const full = await eventsApi.getById(event.id)
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
  <div class="mx-auto max-w-4xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('events.adminTitle') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('events.adminSubtitle') }}</p>
      </div>
      <AppButton icon="plus" @click="openNew">{{ t('events.newEvent') }}</AppButton>
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 4" :key="n" class="h-20 w-full rounded-xl" />
    </div>
    <EmptyState
      v-else-if="!items.length"
      class="mt-6"
      icon="calendar"
      :title="t('events.empty')"
      :description="t('events.adminEmptyHint')"
    />

    <template v-else>
      <section v-for="group in [{ key: 'upcoming', rows: upcoming }, { key: 'past', rows: past }]" :key="group.key">
        <h2 v-if="group.rows.length" class="mt-8 text-caption font-semibold uppercase tracking-widest text-ink-faint">
          {{ t(`events.${group.key}`) }}
        </h2>
        <div class="mt-3 space-y-3">
          <AppCard v-for="event in group.rows" :key="event.id" class="flex flex-wrap items-center justify-between gap-4 p-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate font-medium text-ink">{{ event.title }}</p>
                <Badge variant="neutral" size="sm">{{ t('eventTypes.' + event.type) }}</Badge>
                <Badge v-if="event.status === 'CANCELLED'" variant="danger" size="sm">{{ t('events.cancelled') }}</Badge>
                <Badge v-if="event.mode !== 'OFFLINE'" variant="info" size="sm">{{ t(`events.mode.${event.mode}`) }}</Badge>
              </div>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-3 text-small text-ink-muted">
                <span>{{ formatWhen(event.startAt) }}</span>
                <span v-if="event.location">· {{ event.location }}</span>
                <span v-if="event.requiresRegistration">
                  · {{ event.capacity ? t('events.seats', { taken: event.registeredCount, total: event.capacity }) : t('events.registeredCount', { count: event.registeredCount }) }}
                </span>
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <AppButton v-if="event.requiresRegistration" variant="secondary" size="sm" icon="users" @click="openSheet(event)">
                {{ t('events.attendance') }}
              </AppButton>
              <AppButton variant="ghost" size="sm" icon="pencil" @click="openEdit(event)" />
              <AppButton
                v-if="event.status !== 'CANCELLED'"
                variant="ghost"
                size="sm"
                icon="close"
                @click="cancelEvent(event)"
              />
            </div>
          </AppCard>
        </div>
      </section>
    </template>

    <!-- Editor -->
    <Modal v-model="editorOpen" :title="draft.id ? t('events.editEvent') : t('events.newEvent')" size="lg">
      <div class="space-y-4">
        <AppInput v-model="draft.title" :label="t('courses.fields.title')" required />
        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('courses.fields.description') }}</label>
          <textarea
            v-model="draft.description"
            rows="2"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <AppSelect
            v-model="draft.type"
            :label="t('events.type')"
            :options="TYPES.map((value) => ({ value, label: t('eventTypes.' + value) }))"
          />
          <AppSelect
            v-model="draft.mode"
            :label="t('events.modeLabel')"
            :options="MODES.map((value) => ({ value, label: t(`events.mode.${value}`) }))"
          />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <AppDatePicker v-model="draft.startAt" with-time :label="t('events.startAt')" required />
          <AppDatePicker v-model="draft.endAt" with-time :label="t('events.endAt')" required />
        </div>
        <AppInput v-if="draft.mode !== 'ONLINE'" v-model="draft.location" :label="t('events.location')" />

        <template v-if="draft.mode !== 'OFFLINE'">
          <AppInput v-model="draft.meeting.url" :label="t('events.meetingUrl')" />
          <div class="grid gap-3 sm:grid-cols-2">
            <AppInput v-model="draft.meeting.meetingId" :label="t('events.meetingId')" />
            <AppInput
              v-model="draft.meeting.passcode"
              :label="t('events.passcode')"
              :hint="t('events.passcodeHint')"
            />
          </div>
        </template>

        <label class="flex items-center gap-2 text-small text-ink">
          <input v-model="draft.requiresRegistration" type="checkbox" class="h-4 w-4 rounded border-border-strong" />
          {{ t('events.requiresRegistration') }}
        </label>
        <AppInput
          v-if="draft.requiresRegistration"
          v-model="draft.capacity"
          type="number"
          :label="t('events.capacity')"
          :hint="t('events.capacityHint')"
        />

        <div>
          <p class="mb-1.5 text-small font-medium text-ink">{{ t('events.reminders') }}</p>
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

        <p v-if="draft.id" class="text-caption text-ink-faint">{{ t('events.editNotifyHint') }}</p>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="editorOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

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
