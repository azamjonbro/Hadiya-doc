<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { videoAnalyticsApi } from '@/services/videoAnalytics'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({ videoId: { type: String, required: true } })

const { t } = useI18n()
const search = ref('')
const results = ref([])
const report = ref(null)
const errorMessage = ref('')
const loadingReport = ref(false)

async function onSearch() {
  // Wrapped rather than left bare: an unhandled rejection here used to
  // take the whole handler down silently. No toast — this runs on every
  // keystroke or scroll, and a banner per failed attempt is worse than
  // the empty list the reader already sees.
  try {
    if (!search.value) {
      results.value = []
      return
    }
    const { items } = await usersApi.list({ search: search.value, limit: 5 })
    results.value = items
  } catch {
    /* nothing to show; the list simply does not grow */
  }
}

async function selectUser(user) {
  results.value = []
  search.value = user.fullName
  loadingReport.value = true
  errorMessage.value = ''
  report.value = null
  try {
    report.value = await videoAnalyticsApi.getUserReport(props.videoId, user.id)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loadingReport.value = false
  }
}

function formatDuration(seconds) {
  const total = Math.round(seconds ?? 0)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

const metrics = (r) => [
  { label: t('videoReport.progress'), value: `${r.progress}%`, icon: 'trending-up' },
  { label: t('videoReport.watched'), value: formatDuration(r.watchedSeconds), icon: 'play' },
  { label: t('videoReport.skipped'), value: formatDuration(r.skippedSeconds), icon: 'arrow-right' },
  { label: t('videoReport.pauses'), value: `${r.pausesCount} ${t('videoReport.times')}`, icon: 'pause' },
  { label: t('videoReport.tabSwitches'), value: `${r.tabSwitches} ${t('videoReport.times')}`, icon: 'activity' },
  { label: t('videoReport.sessions'), value: r.sessionsCount, icon: 'layers' },
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
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div v-for="m in metrics(report)" :key="m.label" class="rounded-md bg-surface-2 p-3">
          <p class="flex items-center gap-1.5 text-caption text-ink-faint"><Icon :name="m.icon" size="12" />{{ m.label }}</p>
          <p class="mt-1 text-small font-semibold text-ink">{{ m.value }}</p>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-caption text-ink-faint">
        <span>{{ t('videoReport.firstWatched') }}: {{ formatDate(report.firstWatchedAt) }}</span>
        <span>{{ t('videoReport.lastWatched') }}: {{ formatDate(report.lastWatchedAt) }}</span>
        <Badge :variant="report.completed ? 'success' : 'warning'" size="sm">
          {{ t('videoReport.completed') }}: {{ report.completed ? t('videoReport.yes') : t('videoReport.no') }}
        </Badge>
      </div>
    </template>
  </div>
</template>
