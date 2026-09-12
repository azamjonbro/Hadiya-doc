<script setup>
/** "Достижения": points earned, with what for, and the badges held. */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { gamificationApi } from '@/services/gamification'
import { formatDate } from '@/utils/format'
import { apiErrorText } from '@/utils/apiError'
import DataTable from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TabError from './TabError.vue'

const props = defineProps({ userId: { type: String, required: true } })
const { t, te, locale } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const points = ref({ summary: {}, items: [] })
const badges = ref([])
const tab = ref('points')

const columns = [
  { key: 'earnedAt', label: t('employee.achievements.date'), width: 'w-40' },
  { key: 'reason', label: t('employee.achievements.earnedFor') },
  { key: 'points', label: t('employee.achievements.pointsCol'), width: 'w-28', align: 'right' },
]
const tabs = computed(() => [
  { value: 'points', label: t('employee.achievements.points', { count: points.value.items.length }) },
  { value: 'badges', label: t('employee.achievements.badges', { count: badges.value.length }) },
])

function reason(row) {
  const key = `portal.profile.source.${row.source}`
  const what = te(key) ? t(key) : row.source
  return [what, row.itemTitle || row.courseTitle].filter(Boolean).join(' · ')
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [p, b] = await Promise.all([gamificationApi.userPoints(props.userId), gamificationApi.userBadges(props.userId)])
    points.value = p
    badges.value = b.items ?? b
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
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="item in tabs"
        :key="item.value"
        type="button"
        class="rounded-full px-3.5 py-1.5 text-small font-medium transition-default"
        :class="tab === item.value ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink'"
        @click="tab = item.value"
      >
        {{ item.label }}
      </button>
      <span v-if="!loading && points.summary?.totalPoints" class="ml-auto text-small text-ink-muted">
        {{ t('employee.achievements.total') }}: <strong class="text-ink">{{ points.summary.totalPoints }}</strong>
        <template v-if="points.summary.rank"> · {{ t('employee.achievements.rank') }}: {{ points.summary.rank }}</template>
      </span>
    </div>

    <TabError v-if="errorMessage" class="mt-4" :message="errorMessage" @retry="load" />

    <DataTable
      v-else-if="tab === 'points'"
      settings-key="employee-points"
      class="mt-5"
      :columns="columns"
      :rows="points.items"
      :loading="loading"
      empty-icon="star"
      :empty-title="t('employee.achievements.noPoints')"
    >
      <template #cell-earnedAt="{ row }">{{ formatDate(row.earnedAt, locale) }}</template>
      <template #cell-reason="{ row }">{{ reason(row) }}</template>
      <template #cell-points="{ row }"><span class="inline-flex items-center gap-1 text-primary"><Icon name="award" size="14" /> +{{ row.points }}</span></template>
    </DataTable>

    <div v-else class="mt-5">
      <div v-if="loading" class="grid gap-3 sm:grid-cols-3"><Skeleton v-for="i in 3" :key="i" class="h-20" /></div>
      <EmptyState v-else-if="!badges.length" icon="award" :title="t('employee.achievements.noBadges')" />
      <ul v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="badge in badges" :key="badge.code" class="flex items-start gap-3 rounded-xl border border-border p-4">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary"><Icon :name="badge.icon || 'award'" size="18" /></span>
          <div class="min-w-0">
            <p class="text-small font-medium text-ink">{{ badge.name }}</p>
            <p class="mt-0.5 text-caption text-ink-muted">{{ badge.description }}</p>
            <p v-if="badge.earnedAt" class="mt-1 text-caption text-ink-faint">{{ formatDate(badge.earnedAt, locale) }}</p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
