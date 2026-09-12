<script setup>
/** "Компетенции": where this person stands against each competency. */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { competenciesApi } from '@/services/competencies'
import { apiErrorText } from '@/utils/apiError'
import Badge from '@/components/ui/Badge.vue'
import DataTable from '@/components/ui/DataTable.vue'
import TabError from './TabError.vue'

const props = defineProps({ userId: { type: String, required: true } })
const { t } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const items = ref([])

const columns = [
  { key: 'name', label: t('employee.competencies.competency') },
  { key: 'level', label: t('employee.competencies.level'), width: 'w-32' },
  { key: 'required', label: t('employee.competencies.target'), width: 'w-32' },
  { key: 'status', label: t('users.status'), width: 'w-40' },
  { key: 'source', label: t('employee.competencies.source'), width: 'w-44' },
]
const tone = { MET: 'success', GAP: 'warning', MISSING: 'danger', EXPIRED: 'warning', ASSESSED: 'info', UNASSESSED: 'neutral' }
// Only what has been assessed, or is required: the reference shows an empty
// state until an assessment happened, not the whole catalogue.
const rows = computed(() => items.value.filter((i) => i.level !== null || i.required > 0))
const assessed = computed(() => items.value.some((i) => i.level !== null))

function levelLabel(item, value) {
  if (value === null || value === undefined) return '—'
  return item.levels?.find((l) => l.value === value)?.label ?? String(value)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await competenciesApi.forUser(props.userId)
    items.value = result.items ?? result
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
    <p class="text-[15px] text-ink">{{ t('employee.competencies.hint') }}</p>
    <TabError v-if="errorMessage" class="mt-4" :message="errorMessage" @retry="load" />
    <DataTable
      v-else
      settings-key="employee-competencies"
      class="mt-5"
      :columns="columns"
      :rows="assessed ? rows : []"
      :loading="loading"
      empty-icon="award"
      :empty-title="t('employee.competencies.empty')"
      :empty-description="t('employee.competencies.emptyHint')"
      row-key="competencyId"
    >
      <template #cell-level="{ row }">{{ levelLabel(row, row.effectiveLevel) }}</template>
      <template #cell-required="{ row }">{{ row.required ? levelLabel(row, row.required) : '—' }}</template>
      <template #cell-status="{ row }"><Badge :variant="tone[row.status] ?? 'neutral'" size="sm">{{ t(`competency.cell.${row.status}`) }}</Badge></template>
      <template #cell-source="{ row }">{{ row.source ? t(`competency.sourceLabel.${row.source}`) : '—' }}</template>
    </DataTable>
  </div>
</template>
