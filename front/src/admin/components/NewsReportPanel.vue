<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { newsAnalyticsApi } from '@/services/newsAnalytics'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({ newsId: { type: String, required: true } })

const { t } = useI18n()
const search = ref('')
const results = ref([])
const report = ref(null)
const errorMessage = ref('')
const loadingReport = ref(false)

async function onSearch() {
  if (!search.value) {
    results.value = []
    return
  }
  const { items } = await usersApi.list({ search: search.value, limit: 5 })
  results.value = items
}

async function selectUser(user) {
  results.value = []
  search.value = user.fullName
  loadingReport.value = true
  errorMessage.value = ''
  report.value = null
  try {
    report.value = await newsAnalyticsApi.getUserReport(props.newsId, user.id)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loadingReport.value = false
  }
}

function formatTime(seconds) {
  const total = Math.round(seconds ?? 0)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}m ${rest}s`
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

const metrics = (r) => [
  { label: t('newsReport.readPercent'), value: `${r.readPercent}%`, icon: 'trending-up' },
  { label: t('newsReport.timeSpent'), value: formatTime(r.timeSpentSeconds), icon: 'clock' },
  { label: t('newsReport.openCount'), value: r.openCount, icon: 'eye' },
]
</script>

<template>
  <div class="mt-3 rounded-lg border border-border bg-surface p-4">
    <p class="flex items-center gap-1.5 text-small font-semibold text-ink"><Icon name="bar-chart" size="14" />{{ t('videoReport.title') }}</p>

    <div class="relative mt-3">
      <AppInput v-model="search" icon="search" :placeholder="t('videoReport.searchUser')" @input="onSearch" />
      <ul v-if="results.length > 0" class="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface text-small shadow-md">
        <li v-for="user in results" :key="user.id" class="cursor-pointer px-3 py-2 transition-default hover:bg-surface-2" @click="selectUser(user)">
          {{ user.fullName }} <span class="text-ink-faint">({{ user.jshshir }})</span>
        </li>
      </ul>
    </div>

    <p v-if="loadingReport" class="mt-3 text-small text-ink-faint">{{ t('videoReport.loading') }}</p>
    <p v-if="errorMessage" class="mt-3 text-small text-danger">{{ errorMessage }}</p>

    <template v-if="report">
      <div class="mt-4 grid grid-cols-3 gap-3">
        <div v-for="m in metrics(report)" :key="m.label" class="rounded-md bg-surface-2 p-3">
          <p class="flex items-center gap-1.5 text-caption text-ink-faint"><Icon :name="m.icon" size="12" />{{ m.label }}</p>
          <p class="mt-1 text-small font-semibold text-ink">{{ m.value }}</p>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-caption text-ink-faint">
        <span>{{ t('videoReport.firstWatched') }}: {{ formatDate(report.firstOpenedAt) }}</span>
        <span>{{ t('videoReport.lastWatched') }}: {{ formatDate(report.lastOpenedAt) }}</span>
        <Badge :variant="report.opened ? 'success' : 'neutral'" size="sm">
          {{ t('newsReport.opened') }}: {{ report.opened ? t('videoReport.yes') : t('videoReport.no') }}
        </Badge>
      </div>
    </template>
  </div>
</template>
