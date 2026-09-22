<script setup>
/** "Обучение на рабочем месте": this person's OJT sessions, newest first. */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ojtApi } from '@/services/ojt'
import { formatDateTime } from '@/utils/format'
import { apiErrorText } from '@/utils/apiError'
import Badge from '@/components/ui/Badge.vue'
import DataTable from '@/components/ui/DataTable.vue'
import TabError from './TabError.vue'

const props = defineProps({ userId: { type: String, required: true } })
const { t, locale } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const rows = ref([])

const columns = [
  { key: 'checklistName', label: t('employee.ojt.checklist') },
  { key: 'status', label: t('employee.ojt.status'), width: 'w-40' },
  { key: 'when', label: t('employee.ojt.date'), width: 'w-44' },
  { key: 'observerName', label: t('employee.ojt.observer') },
  { key: 'result', label: t('employee.ojt.result'), width: 'w-36' },
]
const tone = { SCHEDULED: 'neutral', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELLED: 'neutral' }

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await ojtApi.sessions({ traineeId: props.userId, limit: 100 })
    rows.value = (result.items ?? result).map((s) => ({ ...s, when: s.completedAt ?? s.startedAt ?? s.scheduledAt }))
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
    <p class="text-[15px] text-ink">{{ t('employee.ojt.hint') }}</p>
    <TabError v-if="errorMessage" class="mt-4" :message="errorMessage" @retry="load" />
    <DataTable
      v-else
      settings-key="employee-ojt"
      class="mt-5"
      :columns="columns"
      :rows="rows"
      :loading="loading"
      empty-icon="check-square"
      :empty-title="t('employee.ojt.empty')"
      :empty-description="t('employee.ojt.emptyHint')"
    >
      <template #cell-status="{ row }"><Badge :variant="tone[row.status] ?? 'neutral'" size="sm">{{ t(`ojt.sessionStatus.${row.status}`) }}</Badge></template>
      <template #cell-when="{ row }">{{ row.when ? formatDateTime(row.when, locale) : '—' }}</template>
      <template #cell-result="{ row }">
        <template v-if="row.outcome"><Badge :variant="row.outcome === 'PASS' ? 'success' : 'danger'" size="sm">{{ t(`ojt.outcome.${row.outcome}`) }}</Badge> <span class="text-caption text-ink-faint">{{ row.score?.percent ?? 0 }}%</span></template>
        <span v-else>—</span>
      </template>
    </DataTable>
  </div>
</template>
