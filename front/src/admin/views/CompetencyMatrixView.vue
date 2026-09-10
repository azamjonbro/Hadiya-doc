<script setup>
/**
 * The skill matrix — people down the side, competencies across the top.
 *
 * Rendered as a real `<table>` rather than a CSS grid of divs: a screen
 * reader needs the row and column headers to announce "Xalilov Doston,
 * SLS-01" when it lands on a cell, and that association is what `<th
 * scope>` gives for free and a grid of divs would have to fake with
 * aria-labels on every cell.
 *
 * The grid scrolls inside its own container, and the person column is
 * sticky: with twenty competencies across, a row without a name attached is
 * unreadable, and letting the page itself scroll sideways would take the
 * filters and the pagination off screen with it.
 *
 * After a level is recorded only the affected row is re-read (via
 * `/competencies/users/:id`) rather than the whole page: reloading the grid
 * would move nothing on screen except the one cell, and would also throw
 * away the scroll position the assessor is working from. The row's fit
 * percentage is recomputed locally from its own cells, not taken from that
 * response — the response covers the whole catalogue, while the matrix's
 * percentage is over the columns currently displayed, and mixing the two
 * would make one row disagree with every other row on screen.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ORG_LIST_TYPES } from '@lms/shared'
import { competenciesApi } from '@/services/competencies'
import { usersApi } from '@/services/users'
import { useAuthStore } from '@/stores/auth'
import { useOrgDirectory } from '@/composables/useOrgDirectory'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { formatDate } from '@/utils/format'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t, locale } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const directory = useOrgDirectory()

const LIMIT = 25

// Only the sources a person can honestly claim while typing into this box.
// REVIEW360, OJT and IMPORT are written by the instruments that produce
// them; offering them here would let a hand-entered level be filed as if a
// review cycle or an observed shift had produced it.
const MANUAL_SOURCES = ['MANAGER', 'ASSESSMENT', 'CERTIFICATE']

const STATUS_CLASS = {
  MET: 'bg-success-subtle text-success',
  GAP: 'bg-warning-subtle text-warning',
  MISSING: 'bg-danger-subtle text-danger',
  EXPIRED: 'bg-danger-subtle text-danger ring-1 ring-inset ring-danger/40',
  ASSESSED: 'bg-info-subtle text-info',
  UNASSESSED: 'bg-surface-2 text-ink-faint',
}

const LEGEND = ['MET', 'GAP', 'MISSING', 'EXPIRED']

const loading = ref(true)
const saving = ref(false)
const page = ref(1)
const matrix = ref({ competencies: [], items: [], total: 0 })
const catalogue = ref([])
const branchOptions = ref([])

const EMPTY_FILTERS = { search: '', department: '', position: '', branch: '', competencyId: '' }
const filters = reactive({ ...EMPTY_FILTERS })

const modalOpen = ref(false)
const target = ref(null)
const draft = reactive({ level: '0', source: 'MANAGER', note: '' })

// Both permissions carry the write on the server; the route only gates on
// the first, so a catalogue manager arriving here would otherwise see cells
// they are allowed to change rendered as dead text.
const canAssess = computed(
  () => auth.hasPermission('competency:assess') || auth.hasPermission('competency:manage')
)

const totalPages = computed(() => Math.max(1, Math.ceil((matrix.value.total || 0) / LIMIT)))

const competencyOptions = computed(() =>
  catalogue.value.map((entry) => ({ value: entry.id, label: `${entry.code} · ${entry.name}` }))
)

// One list, read twice — FilterBar renders from it and decides "is anything
// filtered" from the same keys.
const filterFields = computed(() => [
  { key: 'search', type: 'search', width: 'w-56', placeholder: t('competency.searchPlaceholder') },
  {
    key: 'department',
    type: 'select',
    placeholder: t('competency.allDepartments'),
    options: directory.optionsFor(ORG_LIST_TYPES.DEPARTMENT),
  },
  {
    key: 'position',
    type: 'select',
    placeholder: t('competency.allPositions'),
    options: directory.optionsFor(ORG_LIST_TYPES.POSITION),
  },
  { key: 'branch', type: 'branch', placeholder: t('competency.allBranches'), options: branchOptions.value },
  {
    key: 'competencyId',
    type: 'select',
    width: 'w-56',
    placeholder: t('competency.allCompetencies'),
    options: competencyOptions.value,
  },
])

/** The rungs of one competency's own ladder, for the assess dialog. */
function ladderOf(competencyId) {
  return catalogue.value.find((entry) => entry.id === competencyId)?.levels ?? []
}

const levelOptions = computed(() => {
  if (!target.value) return []
  const ladder = ladderOf(target.value.competency.id)
  const rungs = ladder.length
    ? ladder.map((level) => ({ value: String(level.value), label: `${level.value} · ${level.label}` }))
    // The catalogue call is the only source of rung *names*; if it failed,
    // the scale height still comes with the matrix, so the dialog degrades
    // to bare numbers rather than refusing to open.
    : Array.from({ length: target.value.competency.maxLevel }, (_, index) => ({
        value: String(index + 1),
        label: String(index + 1),
      }))
  // 0 is a real answer — "looked at, does not have it" — and is not a rung.
  return [{ value: '0', label: t('competency.levelNone') }, ...rungs]
})

const sourceOptions = computed(() =>
  MANUAL_SOURCES.map((source) => ({ value: source, label: t(`competency.sourceLabel.${source}`) }))
)

function queryParams() {
  const params = { page: page.value, limit: LIMIT }
  if (filters.search.trim()) params.q = filters.search.trim()
  if (filters.department) params.department = filters.department
  if (filters.position) params.position = filters.position
  if (filters.branch) params.branch = filters.branch
  // The API takes a comma-separated list; the screen narrows to one column
  // at a time, which is the only shape a single select can honestly send.
  if (filters.competencyId) params.competencyIds = filters.competencyId
  return params
}

async function load() {
  loading.value = true
  try {
    matrix.value = await competenciesApi.matrix(queryParams())
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.loadError')))
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  load()
}

function goToPage(next) {
  page.value = next
  load()
}

function competencyById(id) {
  return matrix.value.competencies.find((entry) => entry.id === id)
}

function cellText(cell) {
  if (cell.effectiveLevel === null || cell.effectiveLevel === undefined) return '—'
  return cell.required > 0 ? `${cell.effectiveLevel}/${cell.required}` : String(cell.effectiveLevel)
}

function cellAria(row, cell) {
  return t('competency.cellAria', {
    name: row.fullName,
    competency: competencyById(cell.competencyId)?.name ?? '',
    status: t(`competency.cell.${cell.status}`),
    level: cell.effectiveLevel ?? t('competency.notAssessed'),
    required: cell.required,
  })
}

function openAssess(row, cell) {
  const competency = competencyById(cell.competencyId)
  if (!competency) return
  target.value = { row, cell, competency }
  // Pre-filled with what stands today so a dialog opened to correct a typo
  // does not silently propose 0.
  draft.level = String(cell.level ?? 0)
  draft.source = 'MANAGER'
  draft.note = ''
  modalOpen.value = true
}

/**
 * Re-read one person and fold the result back into their row. The response
 * covers the whole active catalogue, so cells absent from the current
 * column set are simply ignored.
 */
async function refreshRow(userId) {
  const row = matrix.value.items.find((entry) => entry.userId === userId)
  if (!row) return
  const profile = await competenciesApi.forUser(userId)
  const fresh = new Map(profile.items.map((item) => [item.competencyId, item]))
  row.cells = row.cells.map((cell) => {
    const item = fresh.get(cell.competencyId)
    if (!item) return cell
    return {
      competencyId: cell.competencyId,
      level: item.level,
      effectiveLevel: item.effectiveLevel,
      required: item.required,
      gap: item.gap,
      status: item.status,
      expiresAt: item.expiresAt,
    }
  })
  const required = row.cells.filter((cell) => cell.required > 0)
  row.requiredCount = required.length
  row.metCount = required.filter((cell) => (cell.effectiveLevel ?? 0) >= cell.required).length
  row.fitPercent = row.requiredCount === 0 ? 100 : Math.round((row.metCount / row.requiredCount) * 100)
}

async function save() {
  if (!target.value) return
  saving.value = true
  try {
    await competenciesApi.assess({
      userId: target.value.row.userId,
      competencyId: target.value.competency.id,
      level: Number(draft.level),
      source: draft.source,
      note: draft.note.trim(),
      // `evidence` is deliberately not sent: its `refId` has to be a real
      // course/quiz/certificate id and this screen has no picker for one, so
      // a type with a null reference would be a label pointing at nothing.
      // The note carries "where this came from" until there is a picker.
    })
    modalOpen.value = false
    toast.success(t('competency.saved'))
    try {
      await refreshRow(target.value.row.userId)
    } catch {
      // The write landed; only the redraw failed, and a full reload is a
      // correct — if blunter — way to end up showing the truth.
      await load()
    }
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.saveError')))
  } finally {
    saving.value = false
  }
}

async function loadBranches() {
  try {
    branchOptions.value = await usersApi.branches()
  } catch {
    branchOptions.value = []
  }
}

async function loadCatalogue() {
  try {
    catalogue.value = await competenciesApi.list({ status: 'ACTIVE' })
  } catch {
    catalogue.value = []
  }
}

onMounted(() => {
  load()
  loadCatalogue()
  loadBranches()
  directory.loadAll()
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('competency.matrix') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('competency.matrixSubtitle') }}</p>
      </div>
      <AppButton variant="secondary" size="sm" icon="refresh" :loading="loading" @click="load">
        {{ t('common.refresh') }}
      </AppButton>
    </div>

    <FilterBar
      v-model="filters"
      class="mt-5"
      :fields="filterFields"
      :apply-label="t('common.search')"
      :clear-label="t('common.clear')"
      @apply="applyFilters"
    />

    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-muted">
      <span>{{ t('competency.legend') }}:</span>
      <span v-for="status in LEGEND" :key="status" class="flex items-center gap-1.5">
        <span class="h-3 w-3 rounded-sm" :class="STATUS_CLASS[status]" aria-hidden="true" />
        {{ t(`competency.cell.${status}`) }}
      </span>
      <span v-if="matrix.total" class="ml-auto">{{ t('competency.peopleCount', { count: matrix.total }) }}</span>
    </div>

    <div v-if="loading" class="mt-4 space-y-2">
      <Skeleton v-for="n in 8" :key="n" class="h-11 w-full rounded-md" />
    </div>

    <EmptyState
      v-else-if="!matrix.competencies.length"
      class="mt-6"
      icon="layers"
      :title="t('competency.noCompetencies')"
      :description="t('competency.noCompetenciesHint')"
    />

    <EmptyState
      v-else-if="!matrix.items.length"
      class="mt-6"
      icon="users"
      :title="t('competency.noPeople')"
      :description="t('competency.noPeopleHint')"
    />

    <template v-else>
      <!-- The only element on the page allowed to scroll sideways. `tabindex`
           makes it reachable by keyboard on its own, which is what lets
           somebody who cannot use a mouse scroll to the far columns. -->
      <div
        class="mt-4 overflow-x-auto rounded-lg border border-border bg-surface"
        tabindex="0"
        role="region"
        :aria-label="t('competency.matrix')"
      >
        <table class="w-full border-collapse text-small">
          <caption class="sr-only">{{ t('competency.matrixSubtitle') }}</caption>
          <thead>
            <tr class="border-b border-border">
              <th
                scope="col"
                class="sticky left-0 z-20 min-w-[13rem] bg-surface px-4 py-3 text-left text-caption font-medium uppercase tracking-wide text-ink-faint"
              >
                {{ t('competency.person') }}
              </th>
              <th
                v-for="competency in matrix.competencies"
                :key="competency.id"
                scope="col"
                class="px-2 py-3 text-center text-caption font-medium text-ink-muted"
                :title="competency.name"
              >
                <span class="block max-w-[6rem] truncate">{{ competency.code }}</span>
              </th>
              <th scope="col" class="px-4 py-3 text-right text-caption font-medium uppercase tracking-wide text-ink-faint">
                {{ t('competency.fit') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrix.items" :key="row.userId" class="border-b border-border last:border-0">
              <th scope="row" class="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-normal">
                <span class="block truncate font-medium text-ink">{{ row.fullName }}</span>
                <span class="block truncate text-caption text-ink-faint">
                  {{ row.position || '—' }}<template v-if="row.department"> · {{ row.department }}</template>
                </span>
              </th>

              <td v-for="cell in row.cells" :key="cell.competencyId" class="px-1.5 py-2 text-center">
                <button
                  v-if="canAssess"
                  type="button"
                  class="mx-auto flex h-9 w-full min-w-[3rem] max-w-[5rem] items-center justify-center gap-1 rounded-md text-small font-medium tabular-nums transition-default hover:opacity-80"
                  :class="STATUS_CLASS[cell.status]"
                  :aria-label="cellAria(row, cell)"
                  @click="openAssess(row, cell)"
                >
                  <Icon v-if="cell.status === 'EXPIRED'" name="clock" size="12" aria-hidden="true" />
                  {{ cellText(cell) }}
                </button>
                <span
                  v-else
                  class="mx-auto flex h-9 w-full min-w-[3rem] max-w-[5rem] items-center justify-center gap-1 rounded-md text-small font-medium tabular-nums"
                  :class="STATUS_CLASS[cell.status]"
                  :title="cellAria(row, cell)"
                >
                  <Icon v-if="cell.status === 'EXPIRED'" name="clock" size="12" aria-hidden="true" />
                  {{ cellText(cell) }}
                </span>
              </td>

              <td class="px-4 py-2 text-right">
                <Badge :variant="row.fitPercent >= 100 ? 'success' : row.fitPercent >= 60 ? 'warning' : 'danger'" size="sm">
                  {{ row.fitPercent }}%
                </Badge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="mt-4 flex justify-end">
        <Pagination :page="page" :total-pages="totalPages" @update:page="goToPage" />
      </div>
    </template>

    <Modal
      v-model="modalOpen"
      size="md"
      :title="t('competency.assessTitle')"
      :description="
        target ? t('competency.assessFor', { name: target.row.fullName, competency: target.competency.name }) : ''
      "
    >
      <div v-if="target" class="space-y-4">
        <AppCard padding="sm" class="bg-surface-2">
          <dl class="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt class="text-caption text-ink-faint">{{ t('competency.required') }}</dt>
              <dd class="text-small text-ink">
                {{ target.cell.required || t('competency.noRequirements') }}
              </dd>
            </div>
            <div>
              <dt class="text-caption text-ink-faint">{{ t('competency.current') }}</dt>
              <dd class="text-small text-ink">
                {{ target.cell.level === null ? t('competency.notAssessed') : target.cell.level }}
              </dd>
            </div>
            <div>
              <dt class="text-caption text-ink-faint">{{ t('competency.effective') }}</dt>
              <dd class="text-small" :class="target.cell.status === 'EXPIRED' ? 'text-danger' : 'text-ink'">
                {{ target.cell.effectiveLevel === null ? '—' : target.cell.effectiveLevel }}
              </dd>
            </div>
          </dl>
          <p v-if="target.cell.status === 'EXPIRED'" class="mt-2 text-caption text-danger">
            {{ t('competency.expiredOn', { date: formatDate(target.cell.expiresAt, locale) }) }} ·
            {{ t('competency.expiredExplain') }}
          </p>
        </AppCard>

        <AppSelect v-model="draft.level" :label="t('competency.level')" :options="levelOptions" />
        <AppSelect v-model="draft.source" :label="t('competency.source')" :options="sourceOptions" />
        <AppInput v-model="draft.note" :label="t('competency.note')" />
        <p class="text-caption text-ink-faint">{{ t('competency.effectiveHint') }}</p>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
