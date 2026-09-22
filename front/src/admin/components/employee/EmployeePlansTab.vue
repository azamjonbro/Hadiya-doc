<script setup>
/** "Планы развития": the plans assigned to this person and how far along. */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { developmentPlansApi } from '@/services/developmentPlans'
import { formatDate } from '@/utils/format'
import { apiErrorText } from '@/utils/apiError'
import Badge from '@/components/ui/Badge.vue'
import DataTable from '@/components/ui/DataTable.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import TabError from './TabError.vue'

const props = defineProps({ userId: { type: String, required: true } })
const { t, locale } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const rows = ref([])

const columns = [
  { key: 'title', label: t('employee.plans.name') },
  { key: 'status', label: t('employee.plans.status'), width: 'w-36' },
  { key: 'progressPercent', label: t('employee.plans.progress'), width: 'w-44' },
  { key: 'periodStart', label: t('employee.plans.start'), width: 'w-36' },
  { key: 'periodEnd', label: t('employee.plans.due'), width: 'w-36' },
  { key: 'goalCount', label: t('devplan.goals'), hidden: true, width: 'w-28' },
]
const tone = { DRAFT: 'neutral', ACTIVE: 'info', REVIEWED: 'primary', COMPLETED: 'success', ARCHIVED: 'neutral' }

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await developmentPlansApi.list({ userId: props.userId, limit: 100 })
    rows.value = result.items ?? result
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div>
    <p class="text-[15px] text-ink">{{ t('employee.plans.hint') }}</p>
    <TabError v-if="errorMessage" class="mt-4" :message="errorMessage" @retry="load" />
    <DataTable
      v-else
      settings-key="employee-plans"
      class="mt-5"
      :columns="columns"
      :rows="rows"
      :loading="loading"
      empty-icon="trending-up"
      :empty-title="t('employee.plans.empty')"
    >
      <template #cell-status="{ row }"><Badge :variant="tone[row.status] ?? 'neutral'" size="sm">{{ t(`devplan.status.${row.status}`) }}</Badge></template>
      <template #cell-progressPercent="{ row }">
        <div class="flex items-center gap-2"><div class="w-24"><ProgressBar :value="row.progressPercent" size="sm" /></div><span class="text-caption text-ink-faint">{{ row.progressPercent }}%</span></div>
      </template>
      <template #cell-periodStart="{ row }">{{ row.periodStart ? formatDate(row.periodStart, locale) : '—' }}</template>
      <template #cell-periodEnd="{ row }">{{ row.periodEnd ? formatDate(row.periodEnd, locale) : '—' }}</template>
      <template #cell-goalCount="{ row }">{{ row.achievedCount }} / {{ row.goalCount }}</template>
    </DataTable>
  </div>
</template>
