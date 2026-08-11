<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { videoAnalyticsApi } from '@/services/videoAnalytics'

const props = defineProps({ videoId: { type: String, required: true } })

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
    report.value = await videoAnalyticsApi.getUserReport(props.videoId, user.id)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
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
</script>

<template>
  <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
    <p class="text-sm font-medium">{{ t('videoReport.title') }}</p>

    <div class="relative mt-2">
      <input
        v-model="search"
        :placeholder="t('videoReport.searchUser')"
        class="w-full rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700"
        @input="onSearch"
      />
      <ul
        v-if="results.length > 0"
        class="absolute z-10 mt-1 w-full rounded-md border border-slate-300 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <li
          v-for="user in results"
          :key="user.id"
          class="cursor-pointer px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="selectUser(user)"
        >
          {{ user.fullName }} ({{ user.username }})
        </li>
      </ul>
    </div>

    <p v-if="loadingReport" class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ t('videoReport.loading') }}</p>
    <p v-if="errorMessage" class="mt-2 text-sm text-red-500">{{ errorMessage }}</p>

    <dl v-if="report" class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.progress') }}</dt>
      <dd class="font-medium">{{ report.progress }}%</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.watched') }}</dt>
      <dd>{{ formatDuration(report.watchedSeconds) }}</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.skipped') }}</dt>
      <dd>{{ formatDuration(report.skippedSeconds) }}</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.pauses') }}</dt>
      <dd>{{ report.pausesCount }} {{ t('videoReport.times') }}</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.tabSwitches') }}</dt>
      <dd>{{ report.tabSwitches }} {{ t('videoReport.times') }}</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.sessions') }}</dt>
      <dd>{{ report.sessionsCount }}</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.firstWatched') }}</dt>
      <dd>{{ formatDate(report.firstWatchedAt) }}</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.lastWatched') }}</dt>
      <dd>{{ formatDate(report.lastWatchedAt) }}</dd>
      <dt class="text-slate-500 dark:text-slate-400">{{ t('videoReport.completed') }}</dt>
      <dd :class="report.completed ? 'text-emerald-500' : 'text-amber-500'">
        {{ report.completed ? t('videoReport.yes') : t('videoReport.no') }}
      </dd>
    </dl>
  </div>
</template>
