<script setup>
/**
 * One report, as a page (rasm «Прогресс учащихся»).
 *
 * The catalogue used to open a report in a modal: a hundred rows, no
 * sorting, the filters left behind on the page underneath. The reference
 * gives each report a page of its own — back arrow and title, the filters
 * as a row of chips, «Export» on the right, a summary card (a donut for
 * the headline percentage and a counter for each total), then the table
 * with sortable columns and pages. This is that page, for every report
 * type at once: the builders describe their columns, and what is a
 * percentage and what is a count is read off the data.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { reportsApi } from '@/services/reports'
import { useToast } from '@/composables/useToast'
import { onClickOutside } from '@/composables/onClickOutside'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import ReportFilterChips from '@/admin/components/reports/ReportFilterChips.vue'
import Icon from '@/components/ui/Icon.vue'
import Pagination from '@/components/ui/Pagination.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const type = computed(() => String(route.params.type))
const FORMATS = ['csv', 'xlsx', 'pdf']
const PAGE_ROWS = 1000
const PAGE_SIZE = 25

function typeLabel(key) {
  return t(`reports.types.${key}`, key)
}

// ------------------------------------------------------------- filters

// The chips write here; the labels (`userLabel`, `managerLabel`) are what
// the chips show and not filters the server knows.
const filters = ref({
  courseId: '',
  dateFrom: '',
  dateTo: '',
  role: '',
  userId: '',
  userLabel: '',
  department: '',
  branch: '',
  groupId: '',
  managerId: '',
  managerLabel: '',
  status: '',
})
const queryFilters = computed(() => {
  const { userLabel, managerLabel, ...rest } = filters.value
  return rest
})

// --------------------------------------------------------------- data

const loading = ref(true)
const errorMessage = ref('')
const report = ref(null)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    report.value = await reportsApi.preview(type.value, queryFilters.value, { limit: PAGE_ROWS })
    page.value = 1
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('reports.error'))
  } finally {
    loading.value = false
  }
}

let debounce = null
watch(queryFilters, () => {
  clearTimeout(debounce)
  debounce = setTimeout(load, 300)
})
watch(type, load)

onMounted(load)

// ----------------------------------------------------------- columns

const columns = computed(() => report.value?.columns ?? [])

// A column is numeric when every row that has a value has a number in it —
// decided by looking, because a builder's columns carry a header and a key
// and nothing about type.
const numericKeys = computed(() => {
  const rows = report.value?.rows ?? []
  if (!rows.length) return new Set()
  return new Set(
    columns.value
      .filter((c) => rows.some((r) => typeof r[c.key] === 'number') && rows.every((r) => r[c.key] == null || typeof r[c.key] === 'number'))
      .map((c) => c.key),
  )
})
const isPercent = (key) => /percent|Percent|Rate$|rate$/.test(key)
const isAverage = (key) => /^avg/.test(key) || isPercent(key)

// The summary card: the first percentage column is the donut (an average),
// every other number column is a counter — a sum for counts, an average for
// averages. At most five, like the reference's row.
const headline = computed(() => {
  const key = columns.value.find((c) => numericKeys.value.has(c.key) && isPercent(c.key))?.key
  if (!key) return null
  const values = report.value.rows.map((r) => r[key]).filter((v) => typeof v === 'number')
  if (!values.length) return null
  return { key, header: columns.value.find((c) => c.key === key).header, value: values.reduce((a, b) => a + b, 0) / values.length }
})
const counters = computed(() =>
  columns.value
    .filter((c) => numericKeys.value.has(c.key) && c.key !== headline.value?.key)
    .slice(0, 5)
    .map((c) => {
      const values = report.value.rows.map((r) => r[c.key]).filter((v) => typeof v === 'number')
      const total = values.reduce((a, b) => a + b, 0)
      return { key: c.key, header: c.header, value: isAverage(c.key) ? (values.length ? total / values.length : 0) : total, average: isAverage(c.key) }
    }),
)

function formatNumber(value, key) {
  if (value == null || value === '') return '—'
  if (typeof value !== 'number') return String(value)
  if (isPercent(key)) return `${(Math.round(value * 10) / 10).toLocaleString()}%`
  return Number.isInteger(value) ? value.toLocaleString() : (Math.round(value * 10) / 10).toLocaleString()
}

// -------------------------------------------------------- search/sort

const search = ref('')
const sort = reactive({ key: '', dir: 'asc' })

function toggleSort(key) {
  if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
  else Object.assign(sort, { key, dir: 'asc' })
  page.value = 1
}

const visibleRows = computed(() => {
  let rows = report.value?.rows ?? []
  const term = search.value.trim().toLowerCase()
  if (term) {
    const textKeys = columns.value.filter((c) => !numericKeys.value.has(c.key)).map((c) => c.key)
    rows = rows.filter((row) => textKeys.some((key) => String(row[key] ?? '').toLowerCase().includes(term)))
  }
  if (sort.key) {
    const key = sort.key
    const numeric = numericKeys.value.has(key)
    const sign = sort.dir === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return numeric ? (av - bv) * sign : String(av).localeCompare(String(bv)) * sign
    })
  }
  return rows
})

const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(visibleRows.value.length / PAGE_SIZE)))
const pageRows = computed(() => visibleRows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const rangeStart = computed(() => (visibleRows.value.length ? (page.value - 1) * PAGE_SIZE + 1 : 0))
const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, visibleRows.value.length))
watch(search, () => (page.value = 1))

// -------------------------------------------------------------- export

const exportOpen = ref(false)
const exportRef = ref(null)
onClickOutside(exportRef, () => (exportOpen.value = false))
const exporting = reactive({})
const queueing = ref(false)

async function download(format) {
  exportOpen.value = false
  exporting[format] = true
  try {
    const result = await reportsApi.download(type.value, format, queryFilters.value)
    if (result?.truncated) toast.error(t('reports.exports.truncated', { exported: result.exportedRows?.toLocaleString(), total: result.totalRows?.toLocaleString() }))
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.error')))
  } finally {
    exporting[format] = false
  }
}

async function queueFull() {
  exportOpen.value = false
  queueing.value = true
  try {
    await reportsApi.queueExport(type.value, 'xlsx', queryFilters.value)
    toast.success(t('reports.exports.queued'))
  } catch (error) {
    toast.error(apiErrorText(error, t('reports.exports.queueFailed')))
  } finally {
    queueing.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <!-- Back arrow and title; export on the right -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <router-link
          to="/bos/reports"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
          :aria-label="t('common.back')"
        >
          <Icon name="arrow-left" size="20" />
        </router-link>
        <h1 class="truncate text-[24px] font-semibold text-ink">{{ report?.title || typeLabel(type) }}</h1>
      </div>
      <div ref="exportRef" class="relative">
        <AppButton variant="secondary" icon="download" :aria-expanded="exportOpen" aria-haspopup="menu" @click="exportOpen = !exportOpen">{{ t('reports.page.export') }}</AppButton>
        <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1" leave-active-class="transition-default" leave-to-class="opacity-0 -translate-y-1">
          <div v-if="exportOpen" class="absolute right-0 z-20 mt-2 w-64 rounded-xl bg-surface p-1.5 shadow-xl" role="menu">
            <button
              v-for="format in FORMATS"
              :key="format"
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] text-ink transition-default hover:bg-surface-2"
              :disabled="exporting[format]"
              @click="download(format)"
            >
              <Icon :name="exporting[format] ? 'loader' : 'file-text'" size="16" class="text-ink-muted" />{{ t('reports.page.exportAs', { format: format.toUpperCase() }) }}
            </button>
            <div class="my-1 border-t border-border"></div>
            <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] text-ink transition-default hover:bg-surface-2" :disabled="queueing" @click="queueFull">
              <Icon name="clock" size="16" class="text-ink-muted" />{{ t('reports.exports.queueFull') }}
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- The filter row: «Filtr qo'shish» and the chips -->
    <ReportFilterChips v-model="filters" class="mt-4" />

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-5 space-y-4">
      <Skeleton class="h-32 w-full rounded-xl" />
      <Skeleton class="h-96 w-full rounded-xl" />
    </div>

    <template v-else-if="report">
      <!-- Rasm: the summary card — donut, then a counter per total -->
      <section v-if="headline || counters.length" class="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-border bg-surface px-6 py-5">
        <div v-if="headline" class="flex items-center gap-5 pr-8 sm:border-r sm:border-border">
          <ProgressRing :value="Math.round(headline.value)" :size="92" :stroke-width="9" variant="success">
            <Icon name="graduation-cap" size="26" class="text-success" />
          </ProgressRing>
          <div>
            <p class="text-[13px] text-ink-muted">{{ headline.header }}</p>
            <p class="mt-1 text-[28px] font-semibold leading-none text-ink">{{ formatNumber(headline.value, headline.key) }}</p>
          </div>
        </div>
        <div v-for="counter in counters" :key="counter.key" class="min-w-[120px]">
          <p class="text-[13px] text-ink-muted">{{ counter.header }}<span v-if="counter.average" class="text-ink-faint"> · {{ t('reports.page.average') }}</span></p>
          <p class="mt-1 text-[26px] font-semibold leading-none text-ink">{{ formatNumber(counter.value, counter.key) }}</p>
        </div>
      </section>

      <!-- Count, range, search -->
      <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p class="text-[16px] font-semibold text-ink">
          {{ t('reports.page.rows', { n: report.totalRows.toLocaleString() }) }}
          <span v-if="report.truncated" class="ml-2 text-[13px] font-normal text-warning">{{ t('reports.page.loadedOf', { n: report.previewRows.toLocaleString() }) }}</span>
        </p>
        <div class="flex items-center gap-3">
          <div class="w-64">
            <AppInput v-model="search" icon="search" :placeholder="t('common.search')" />
          </div>
          <span class="text-[13px] text-ink-muted">{{ t('common.pagination.range', { from: rangeStart, to: rangeEnd, total: visibleRows.length }) }}</span>
        </div>
      </div>

      <EmptyState v-if="!visibleRows.length" icon="file-text" :title="t('reports.preview.empty')" class="mt-4" />
      <div v-else class="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
        <table class="w-full min-w-[880px] text-[14px]">
          <thead>
            <tr class="h-11 border-b border-border bg-surface-2/60 text-left text-[13px] text-ink-muted">
              <th
                v-for="column in columns"
                :key="column.key"
                class="px-4 font-medium"
                :class="numericKeys.has(column.key) ? 'text-right' : ''"
                :aria-sort="sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'"
              >
                <button type="button" class="inline-flex items-center gap-1 whitespace-nowrap hover:text-ink" :class="sort.key === column.key ? 'text-ink' : ''" @click="toggleSort(column.key)">
                  {{ column.header }}
                  <Icon v-if="sort.key === column.key" :name="sort.dir === 'asc' ? 'chevron-up' : 'chevron-down'" size="12" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in pageRows" :key="index" class="h-12 border-b border-border transition-default last:border-b-0 hover:bg-surface-2">
              <td v-for="column in columns" :key="column.key" class="px-4 text-ink" :class="numericKeys.has(column.key) ? 'text-right tabular-nums' : ''">
                <template v-if="numericKeys.has(column.key)">{{ formatNumber(row[column.key], column.key) }}</template>
                <template v-else-if="typeof row[column.key] === 'boolean'">{{ row[column.key] ? t('common.yes') : t('common.no') }}</template>
                <template v-else>{{ row[column.key] ?? '—' }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="mt-4 flex justify-end">
        <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />
      </div>

      <p v-if="report.truncated" class="mt-4 flex items-center gap-2 text-[13px] text-ink-muted">
        <Icon name="alert-triangle" size="14" class="text-warning" />
        {{ t('reports.page.truncated', { shown: report.previewRows.toLocaleString(), total: report.totalRows.toLocaleString() }) }}
        <button type="button" class="text-primary underline underline-offset-4" @click="queueFull">{{ t('reports.exports.queueFull') }}</button>
      </p>
    </template>
  </div>
</template>
