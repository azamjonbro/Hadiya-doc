<script setup>
/** "Сертификаты": issued for this person, with the ⚙ column picker. */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { certificatesApi } from '@/services/certificates'
import { formatDate } from '@/utils/format'
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
  { key: 'title', label: t('employee.certificates.name') },
  { key: 'serial', label: t('employee.certificates.serial'), hidden: true, cellClass: 'font-mono text-caption' },
  { key: 'sourceType', label: t('roles.modules.course'), hidden: true },
  { key: 'issuedAt', label: t('employee.certificates.issuedAt'), width: 'w-40' },
  { key: 'validUntil', label: t('employee.certificates.validUntil'), width: 'w-44' },
  { key: 'status', label: t('employee.certificates.status'), width: 'w-36' },
]
const tone = { VALID: 'success', EXPIRED: 'warning', REVOKED: 'danger' }

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await certificatesApi.list({ userId: props.userId, limit: 100 })
    rows.value = result.items ?? []
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
    <p class="text-[15px] text-ink">{{ t('employee.certificates.hint') }}</p>
    <TabError v-if="errorMessage" class="mt-4" :message="errorMessage" @retry="load" />
    <DataTable
      v-else
      settings-key="employee-certificates"
      class="mt-5"
      :columns="columns"
      :rows="rows"
      :loading="loading"
      empty-icon="award"
      :empty-title="t('employee.certificates.empty')"
    >
      <template #cell-issuedAt="{ row }">{{ formatDate(row.issuedAt, locale) }}</template>
      <template #cell-validUntil="{ row }">{{ row.validUntil ? formatDate(row.validUntil, locale) : '—' }}</template>
      <template #cell-status="{ row }"><Badge :variant="tone[row.status] ?? 'neutral'" size="sm">{{ t(`certificates.status.${row.status}`) }}</Badge></template>
    </DataTable>
  </div>
</template>
