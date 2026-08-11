<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { setLocale } from '@/i18n'
import { useHealthCheck } from '@/composables/useHealthCheck'
import { dashboardApi } from '@/services/dashboard'
import NotificationBell from '@/components/NotificationBell.vue'
import StatCard from '@/components/dashboard/StatCard.vue'
import RankedListCard from '@/components/dashboard/RankedListCard.vue'
import TrendChart from '@/components/dashboard/TrendChart.vue'

const { t } = useI18n()
const theme = useThemeStore()
const auth = useAuthStore()
const router = useRouter()
const { status, check } = useHealthCheck()

const dashboard = ref(null)
const dashboardLoading = ref(true)
const dashboardError = ref('')

const canViewDashboard = computed(() => auth.hasPermission('analytics:view:all'))

async function loadDashboard() {
  if (!canViewDashboard.value) {
    dashboardLoading.value = false
    return
  }
  dashboardLoading.value = true
  dashboardError.value = ''
  try {
    dashboard.value = await dashboardApi.get()
  } catch (error) {
    dashboardError.value = error.response?.data?.message ?? String(error)
  } finally {
    dashboardLoading.value = false
  }
}

onMounted(() => {
  check()
  loadDashboard()
})

function onLocaleChange(event) {
  setLocale(event.target.value)
}

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

function minutes(seconds) {
  return Math.round((seconds ?? 0) / 60)
}

const courseCompletionItems = computed(
  () => dashboard.value?.charts.courseCompletion.map((c) => ({ label: c.title, value: c.avgCompletion, sublabel: `${c.learners}` })) ?? []
)
const mostDifficultItems = computed(
  () => dashboard.value?.charts.mostDifficultCourses.map((c) => ({ label: c.title, value: c.avgCompletion, sublabel: `${c.learners}` })) ?? []
)
const employeeProgressItems = computed(
  () => dashboard.value?.charts.employeeProgress.map((b) => ({ label: `${b.bucket}%`, value: b.count })) ?? []
)
const mostEngagedItems = computed(
  () =>
    dashboard.value?.charts.mostEngagedEmployees.map((e) => ({
      label: e.fullName,
      value: minutes(e.totalWatchedSeconds),
      sublabel: e.department,
    })) ?? []
)
const lowestEngagementItems = computed(
  () =>
    dashboard.value?.charts.lowestEngagement.map((e) => ({
      label: e.fullName,
      value: minutes(e.totalWatchedSeconds),
      sublabel: e.department,
    })) ?? []
)
const mostSkippedItems = computed(
  () => dashboard.value?.charts.mostSkippedVideos.map((v) => ({ label: v.title, value: v.value, sublabel: `${v.viewers}` })) ?? []
)
const mostPausedItems = computed(
  () => dashboard.value?.charts.mostPausedVideos.map((v) => ({ label: v.title, value: v.value, sublabel: `${v.viewers}` })) ?? []
)
const newsEngagementItems = computed(
  () => dashboard.value?.charts.newsEngagement.map((n) => ({ label: n.title, value: n.avgReadPercent, sublabel: `${n.opens}` })) ?? []
)
const taskCompletionItems = computed(() => dashboard.value?.charts.taskCompletion.map((s) => ({ label: s.status, value: s.count })) ?? [])
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-10">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('app.name') }}</h1>
      <div class="flex flex-wrap items-center gap-3">
        <router-link
          v-if="auth.hasPermission('course:read')"
          to="/admin/courses"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('courses.title') }}
        </router-link>
        <router-link
          v-if="auth.hasPermission('news:read')"
          to="/admin/news"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('news.title') }}
        </router-link>
        <router-link
          v-if="auth.hasPermission('task:create')"
          to="/admin/tasks"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('tasks.title') }}
        </router-link>
        <router-link
          v-if="auth.hasPermission('user:read')"
          to="/admin/users"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('users.title') }}
        </router-link>
        <router-link
          v-if="auth.hasPermission('report:export')"
          to="/admin/reports"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('reports.title') }}
        </router-link>
        <NotificationBell />
        <select
          class="rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          @change="onLocaleChange"
        >
          <option value="uz">UZ</option>
          <option value="ru">RU</option>
          <option value="en">EN</option>
        </select>
        <button
          type="button"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
          @click="theme.toggle()"
        >
          {{ theme.theme === 'dark' ? t('theme.light') : t('theme.dark') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
          @click="onLogout"
        >
          {{ t('auth.logout') }}
        </button>
      </div>
    </div>

    <p class="mt-2 text-slate-500 dark:text-slate-400">
      {{ t('nav.dashboard') }} — {{ auth.user?.fullName }} ({{ auth.user?.role }})
    </p>

    <div class="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p class="flex items-center text-sm font-medium">
        <span
          class="mr-2 inline-block h-2 w-2 rounded-full"
          :class="{
            'bg-amber-500': status === 'checking',
            'bg-emerald-500': status === 'online',
            'bg-red-500': status === 'offline',
          }"
        />
        {{
          status === 'checking'
            ? t('backend.checking')
            : status === 'online'
              ? t('backend.online')
              : t('backend.offline')
        }}
      </p>
    </div>

    <template v-if="canViewDashboard">
      <div class="mt-8 flex items-center justify-between">
        <h2 class="text-lg font-semibold tracking-tight text-ink">{{ t('dashboard.title') }}</h2>
        <p v-if="dashboard?.generatedAt" class="text-xs text-ink-faint">
          {{ t('dashboard.generatedAt') }}: {{ new Date(dashboard.generatedAt).toLocaleString() }}
          <span v-if="dashboard.stale"> · {{ t('dashboard.stale') }}</span>
        </p>
      </div>

      <p v-if="dashboardLoading" class="mt-4 text-sm text-ink-faint">{{ t('dashboard.loading') }}</p>
      <p v-else-if="dashboardError" class="mt-4 text-sm text-red-500">{{ dashboardError }}</p>
      <p v-else-if="!dashboard" class="mt-4 text-sm text-ink-faint">{{ t('dashboard.loading') }}</p>

      <template v-else>
        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard :label="t('dashboard.cards.totalEmployees')" :value="dashboard.cards.totalEmployees" />
          <StatCard :label="t('dashboard.cards.activeEmployees')" :value="dashboard.cards.activeEmployees" />
          <StatCard :label="t('dashboard.cards.totalCourses')" :value="dashboard.cards.totalCourses" />
          <StatCard :label="t('dashboard.cards.mandatoryCourses')" :value="dashboard.cards.mandatoryCourses" />
          <StatCard :label="t('dashboard.cards.completedAssignments')" :value="dashboard.cards.completedAssignments" />
          <StatCard :label="t('dashboard.cards.overdueAssignments')" :value="dashboard.cards.overdueAssignments" />
          <StatCard :label="t('dashboard.cards.avgCompletionPercent')" :value="dashboard.cards.avgCompletionPercent" suffix="%" />
          <StatCard :label="t('dashboard.cards.avgWatchTimeSeconds')" :value="minutes(dashboard.cards.avgWatchTimeSeconds)" suffix=" min" />
          <StatCard :label="t('dashboard.cards.newsEngagementPercent')" :value="dashboard.cards.newsEngagementPercent" suffix="%" />
          <StatCard :label="t('dashboard.cards.activeSessions')" :value="dashboard.cards.activeSessions" />
        </div>

        <div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TrendChart :title="t('dashboard.charts.watchTimeByDay')" :points="dashboard.charts.watchTimeByDay" />
          <RankedListCard
            :title="t('dashboard.charts.courseCompletion')"
            :items="courseCompletionItems"
            :empty-text="t('dashboard.empty.courses')"
            value-suffix="%"
          />
          <RankedListCard
            :title="t('dashboard.charts.mostDifficultCourses')"
            :items="mostDifficultItems"
            :empty-text="t('dashboard.empty.courses')"
            value-suffix="%"
          />
          <RankedListCard
            :title="t('dashboard.charts.employeeProgress')"
            :items="employeeProgressItems"
            :empty-text="t('dashboard.empty.employees')"
          />
          <RankedListCard
            :title="t('dashboard.charts.mostEngagedEmployees')"
            :items="mostEngagedItems"
            :empty-text="t('dashboard.empty.employees')"
            value-suffix=" min"
          />
          <RankedListCard
            :title="t('dashboard.charts.lowestEngagement')"
            :items="lowestEngagementItems"
            :empty-text="t('dashboard.empty.employees')"
            value-suffix=" min"
          />
          <RankedListCard
            :title="t('dashboard.charts.mostSkippedVideos')"
            :items="mostSkippedItems"
            :empty-text="t('dashboard.empty.videos')"
            value-suffix="s"
          />
          <RankedListCard
            :title="t('dashboard.charts.mostPausedVideos')"
            :items="mostPausedItems"
            :empty-text="t('dashboard.empty.videos')"
          />
          <RankedListCard
            :title="t('dashboard.charts.newsEngagement')"
            :items="newsEngagementItems"
            :empty-text="t('dashboard.empty.news')"
            value-suffix="%"
          />
          <RankedListCard
            :title="t('dashboard.charts.taskCompletion')"
            :items="taskCompletionItems"
            :empty-text="t('dashboard.empty.tasks')"
          />
        </div>
      </template>
    </template>
  </div>
</template>
