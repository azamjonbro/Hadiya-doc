<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { auditApi } from '@/services/audit'
import { usersApi } from '@/services/users'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()

const PAGE_SIZE = 50

const items = ref([])
const total = ref(0)
const totalPages = ref(1)
const page = ref(1)
const loading = ref(true)
const error = ref('')
const exporting = ref(false)
const exportError = ref('')

const actionOptions = ref([])
const filters = reactive({ action: '', actor: '', actorLabel: '', dateFrom: '', dateTo: '' })
const actorSearch = ref('')
const actorResults = ref([])
const detail = ref(null)

const hasActiveFilters = computed(() =>
  Boolean(filters.action || filters.actor || filters.dateFrom || filters.dateTo)
)
const rangeStart = computed(() => (page.value - 1) * PAGE_SIZE + 1)
const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, total.value))

// Two-line stamp: the date repeats down a page of same-day entries, so the
// time is what the eye actually scans for.
function formatDate(value) {
  return new Date(value).toLocaleDateString()
}
function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// FACE_VERIFICATION_FAILED → "Face verification failed". The catalogue is
// ~70 code-defined names and grows with every feature; translating each one
// would leave new actions blank in three files, so the name is humanised
// here and stays readable whatever gets added next.
function actionLabel(action) {
  const words = action.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Failures and deletions are what someone opens this page to find, so they
// carry colour; everything else stays quiet rather than turning the table
// into a wall of badges.
function actionVariant(action) {
  if (/FAILED|BLOCKED|LOCKED|DENIED/.test(action)) return 'danger'
  if (/DELETED|TRASHED|REMOVED|RESET/.test(action)) return 'warning'
  if (/EXPORTED|VIEWED/.test(action)) return 'info'
  return 'neutral'
}

function summarize(metadata) {
  const entries = Object.entries(metadata ?? {})
  if (entries.length === 0) return ''
  return entries
    .map(([key, value]) => `${key}=${typeof value === 'object' && value !== null ? JSON.stringify(value) : value}`)
    .join(' · ')
}

function queryParams() {
  return {
    action: filters.action,
    actor: filters.actor,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await auditApi.list({ ...queryParams(), page: page.value, limit: PAGE_SIZE })
    items.value = data.items
    total.value = data.total
    totalPages.value = data.totalPages
  } catch (err) {
    error.value = apiErrorText(err, t('audit.error'))
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function loadActionOptions() {
  try {
    const { actions } = await auditApi.filters()
    actionOptions.value = actions.map((action) => ({ value: action, label: actionLabel(action) }))
  } catch {
    // A missing dropdown is not worth an error banner over the table — the
    // log itself still loads, and the other filters still work.
    actionOptions.value = []
  }
}

async function onActorSearch() {
  if (!actorSearch.value) {
    actorResults.value = []
    return
  }
  const { items: found } = await usersApi.list({ search: actorSearch.value, limit: 5 })
  actorResults.value = found
}

function pickActor(user) {
  filters.actor = user.id
  filters.actorLabel = user.fullName
  actorSearch.value = user.fullName
  actorResults.value = []
}

function clearActor() {
  filters.actor = ''
  filters.actorLabel = ''
  actorSearch.value = ''
  actorResults.value = []
}

function clearFilters() {
  filters.action = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  clearActor()
}

async function onExport() {
  exporting.value = true
  exportError.value = ''
  try {
    // The filters, not the page: the file is the view the admin is looking
    // at, all of it.
    await auditApi.downloadCsv(queryParams())
  } catch (err) {
    exportError.value = apiErrorText(err, t('audit.exportError'))
  } finally {
    exporting.value = false
  }
}

// Changing a filter reopens the log at page 1 — page 7 of the old result set
// has nothing to do with the new one.
watch(
  () => [filters.action, filters.actor, filters.dateFrom, filters.dateTo],
  () => {
    page.value = 1
    load()
  }
)
watch(page, load)

onMounted(() => {
  load()
  loadActionOptions()
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('audit.title') }}</h1>
        <p class="mt-1 text-body text-ink-muted">{{ t('audit.subtitle') }}</p>
      </div>
      <div class="text-right">
        <AppButton variant="outline" icon="download" :loading="exporting" :disabled="total === 0" @click="onExport">
          {{ t('audit.export') }}
        </AppButton>
        <p v-if="exportError" class="mt-1 text-caption text-danger">{{ exportError }}</p>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      <div class="w-56">
        <AppSelect
          v-model="filters.action"
          :label="t('audit.filters.action')"
          :placeholder="t('audit.filters.allActions')"
          :options="actionOptions"
        />
      </div>
      <div class="relative w-56">
        <label class="mb-1.5 block text-small font-medium text-ink">{{ t('audit.filters.actor') }}</label>
        <AppInput
          v-model="actorSearch"
          icon="search"
          :placeholder="t('audit.filters.actorPlaceholder')"
          @input="onActorSearch"
        >
          <template v-if="filters.actor" #suffix>
            <button type="button" class="text-ink-faint hover:text-ink-muted" @click="clearActor">
              <Icon name="close" size="15" />
            </button>
          </template>
        </AppInput>
        <ul v-if="actorResults.length > 0" class="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface text-small shadow-md">
          <li
            v-for="user in actorResults"
            :key="user.id"
            class="cursor-pointer px-3 py-2 transition-default hover:bg-surface-2"
            @click="pickActor(user)"
          >
            {{ user.fullName }} <span class="text-ink-faint">({{ user.jshshir }})</span>
          </li>
        </ul>
      </div>
      <div class="w-44">
        <AppDatePicker
          v-model="filters.dateFrom"
          :label="t('audit.filters.dateFrom')"
          :placeholder="t('audit.filters.datePlaceholder')"
        />
      </div>
      <div class="w-44">
        <AppDatePicker
          v-model="filters.dateTo"
          :label="t('audit.filters.dateTo')"
          :placeholder="t('audit.filters.datePlaceholder')"
        />
      </div>
      <AppButton v-if="hasActiveFilters" variant="outline" icon="close" @click="clearFilters">
        {{ t('audit.filters.clear') }}
      </AppButton>
    </div>

    <p v-if="error" class="mt-4 text-small text-danger">{{ error }}</p>

    <div class="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-border text-caption font-semibold uppercase tracking-wide text-ink-faint">
            <th class="px-4 py-3">{{ t('audit.columns.time') }}</th>
            <th class="px-4 py-3">{{ t('audit.columns.actor') }}</th>
            <th class="px-4 py-3">{{ t('audit.columns.action') }}</th>
            <th class="px-4 py-3">{{ t('audit.columns.entity') }}</th>
            <th class="px-4 py-3">{{ t('audit.columns.details') }}</th>
            <th class="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="i in 8" :key="i" class="border-b border-border last:border-0">
              <td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-32" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-36" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-48" /></td>
              <td class="px-4 py-3" />
            </tr>
          </template>
          <tr
            v-for="entry in items"
            :key="entry.id"
            class="cursor-pointer border-b border-border text-small transition-default last:border-0 hover:bg-surface-2"
            @click="detail = entry"
          >
            <td class="whitespace-nowrap px-4 py-3">
              <p class="font-medium text-ink">{{ formatTime(entry.timestamp) }}</p>
              <p class="text-caption text-ink-faint">{{ formatDate(entry.timestamp) }}</p>
            </td>
            <td class="px-4 py-3">
              <!-- An entry outlives the account that made it, and a deleted
                   actor is itself worth seeing rather than hiding as a blank. -->
              <span v-if="entry.actor" class="font-medium text-ink">{{ entry.actor.fullName }}</span>
              <span v-else class="text-ink-faint">{{ t('audit.systemActor') }}</span>
            </td>
            <td class="px-4 py-3">
              <Badge :variant="actionVariant(entry.action)" size="sm">{{ actionLabel(entry.action) }}</Badge>
            </td>
            <td class="px-4 py-3 text-ink-muted">{{ entry.entity }}</td>
            <td class="max-w-md px-4 py-3 text-ink-muted">
              <span class="line-clamp-1 break-all">{{ summarize(entry.metadata) || '—' }}</span>
            </td>
            <td class="px-4 py-3 text-ink-faint"><Icon name="chevron-right" size="15" /></td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && items.length === 0" icon="file-text" :title="t('audit.empty')" />
    </div>

    <div v-if="total > 0" class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-small text-ink-muted">
        {{ t('common.pagination.range', { from: rangeStart, to: rangeEnd, total }) }}
      </p>
      <Pagination v-if="totalPages > 1" :page="page" :total-pages="totalPages" @update:page="page = $event" />
    </div>

    <!-- The row is a summary; this is the record. IP and user agent live only
         here because they are what an investigation needs and noise the rest
         of the time. -->
    <Modal :model-value="detail !== null" :title="t('audit.detail.title')" size="lg" @update:model-value="detail = null">
      <dl v-if="detail" class="grid grid-cols-1 gap-3 text-small sm:grid-cols-2">
        <div>
          <dt class="text-caption text-ink-faint">{{ t('audit.columns.time') }}</dt>
          <dd class="text-ink">{{ new Date(detail.timestamp).toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="text-caption text-ink-faint">{{ t('audit.columns.actor') }}</dt>
          <dd class="text-ink">
            {{ detail.actor ? detail.actor.fullName : t('audit.systemActor') }}
            <span v-if="detail.actor?.email" class="text-ink-faint">({{ detail.actor.email }})</span>
          </dd>
        </div>
        <div>
          <dt class="text-caption text-ink-faint">{{ t('audit.columns.action') }}</dt>
          <dd class="text-ink">{{ detail.action }}</dd>
        </div>
        <div>
          <dt class="text-caption text-ink-faint">{{ t('audit.columns.entity') }}</dt>
          <dd class="text-ink">{{ detail.entity }}<span v-if="detail.entityId" class="text-ink-faint"> · {{ detail.entityId }}</span></dd>
        </div>
        <div>
          <dt class="text-caption text-ink-faint">{{ t('audit.detail.ip') }}</dt>
          <dd class="text-ink">{{ detail.ip || '—' }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-caption text-ink-faint">{{ t('audit.detail.userAgent') }}</dt>
          <dd class="break-all text-ink">{{ detail.userAgent || '—' }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-caption text-ink-faint">{{ t('audit.detail.metadata') }}</dt>
          <dd>
            <pre class="mt-1 max-h-64 overflow-auto rounded-md bg-surface-2 p-3 text-caption text-ink">{{ JSON.stringify(detail.metadata, null, 2) }}</pre>
          </dd>
        </div>
      </dl>
    </Modal>
  </div>
</template>
