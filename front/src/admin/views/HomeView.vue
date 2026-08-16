<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { dashboardApi } from '@/services/dashboard'
import StatCard from '@/admin/components/dashboard/StatCard.vue'
import RankedListCard from '@/admin/components/dashboard/RankedListCard.vue'
import StatusBarList from '@/admin/components/dashboard/StatusBarList.vue'
import TrendChart from '@/admin/components/dashboard/TrendChart.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()

const dashboard = ref(null)
const dashboardLoading = ref(true)
const dashboardError = ref('')

const canViewDashboard = computed(() => auth.hasPermission('analytics:view:all'))

const firstName = computed(() => auth.user?.fullName?.split(' ')[0] ?? '')
const greetingKey = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'dashboard.greeting.morning'
  if (hour < 18) return 'dashboard.greeting.afternoon'
  return 'dashboard.greeting.evening'
})

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

onMounted(loadDashboard)

function minutes(seconds) {
  return Math.round((seconds ?? 0) / 60)
}

const attentionItems = computed(() => {
  if (!dashboard.value) return []
  const c = dashboard.value.cards
  const notStartedCount = dashboard.value.charts.employeeProgress.find((b) => b.bucket === '0-25')?.count ?? 0
  const items = []
  if (c.overdueAssignments > 0) {
    items.push({ icon: 'alert-triangle', tone: 'danger', text: t('dashboard.attention.overdue', { count: c.overdueAssignments }), to: '/admin/courses' })
  }
  if (notStartedCount > 0) {
    items.push({ icon: 'users', tone: 'warning', text: t('dashboard.attention.notStarted', { count: notStartedCount }), to: '/admin/users' })
  }
  if (c.avgCompletionPercent < 50) {
    items.push({ icon: 'trending-down', tone: 'warning', text: t('dashboard.attention.lowCompletion', { pct: c.avgCompletionPercent }), to: '/admin/courses' })
  }
  if (c.newsEngagementPercent < 40) {
    items.push({ icon: 'newspaper', tone: 'warning', text: t('dashboard.attention.lowNewsEngagement', { pct: c.newsEngagementPercent }), to: '/admin/news' })
  }
  return items
})

const toneChip = {
  danger: 'bg-danger-subtle text-danger',
  warning: 'bg-warning-subtle text-warning',
}

const courseCompletionItems = computed(
  () => dashboard.value?.charts.courseCompletion.map((c) => ({ label: c.title, value: c.avgCompletion, sublabel: `${c.learners}` })) ?? [],
)
const mostDifficultItems = computed(
  () => dashboard.value?.charts.mostDifficultCourses.map((c) => ({ label: c.title, value: c.avgCompletion, sublabel: `${c.learners}` })) ?? [],
)
const employeeProgressItems = computed(
  () => dashboard.value?.charts.employeeProgress.map((b) => ({ label: `${b.bucket}%`, value: b.count })) ?? [],
)
const mostEngagedItems = computed(
  () =>
    dashboard.value?.charts.mostEngagedEmployees.map((e) => ({
      label: e.fullName,
      value: minutes(e.totalWatchedSeconds),
      sublabel: e.department,
    })) ?? [],
)
const lowestEngagementItems = computed(
  () =>
    dashboard.value?.charts.lowestEngagement.map((e) => ({
      label: e.fullName,
      value: minutes(e.totalWatchedSeconds),
      sublabel: e.department,
    })) ?? [],
)
const mostSkippedItems = computed(
  () => dashboard.value?.charts.mostSkippedVideos.map((v) => ({ label: v.title, value: v.value, sublabel: `${v.viewers}` })) ?? [],
)
const mostPausedItems = computed(
  () => dashboard.value?.charts.mostPausedVideos.map((v) => ({ label: v.title, value: v.value, sublabel: `${v.viewers}` })) ?? [],
)
const newsEngagementItems = computed(
  () => dashboard.value?.charts.newsEngagement.map((n) => ({ label: n.title, value: n.avgReadPercent, sublabel: `${n.opens}` })) ?? [],
)

const statusTone = { TODO: 'neutral', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELLED: 'neutral' }
const statusIcon = { TODO: 'clock', IN_PROGRESS: 'activity', COMPLETED: 'check-circle', CANCELLED: 'close' }
const taskCompletionItems = computed(
  () =>
    dashboard.value?.charts.taskCompletion.map((s) => ({
      label: t('tasks.status.' + s.status),
      value: s.count,
      tone: statusTone[s.status] ?? 'neutral',
      icon: statusIcon[s.status] ?? 'check-square',
    })) ?? [],
)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-h1 text-ink">{{ t(greetingKey) }}, {{ firstName }}</h1>
        <p class="mt-1 text-body text-ink-muted">{{ t('admin.dashboard.subtitle') }}</p>
      </div>
      <p v-if="dashboard?.generatedAt" class="text-caption text-ink-faint">
        {{ t('dashboard.generatedAt') }} {{ new Date(dashboard.generatedAt).toLocaleString(locale) }}
        <span v-if="dashboard.stale"> · {{ t('dashboard.stale') }}</span>
      </p>
    </div>

    <template v-if="!canViewDashboard">
      <AppCard class="mt-6 text-small text-ink-muted">{{ t('admin.forbidden.message') }}</AppCard>
    </template>

    <template v-else-if="dashboardLoading">
      <div class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton v-for="i in 4" :key="i" class="h-28 w-full" />
      </div>
      <Skeleton class="mt-6 h-48 w-full" />
    </template>

    <p v-else-if="dashboardError" class="mt-6 text-small text-danger">{{ dashboardError }}</p>

    <template v-else-if="dashboard">
      <!-- Primary KPIs -->
      <div class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard :label="t('dashboard.cards.totalEmployees')" :value="dashboard.cards.totalEmployees" icon="users" tone="primary" />
        <StatCard :label="t('dashboard.cards.mandatoryCourses')" :value="dashboard.cards.mandatoryCourses" icon="graduation-cap" tone="primary" />
        <StatCard :label="t('dashboard.cards.avgCompletionPercent')" :value="dashboard.cards.avgCompletionPercent" suffix="%" icon="trending-up" tone="success" />
        <StatCard :label="t('dashboard.cards.overdueAssignments')" :value="dashboard.cards.overdueAssignments" icon="alert-triangle" tone="danger" />
      </div>

      <!-- Secondary metrics strip -->
      <div class="mt-4 grid grid-cols-3 gap-3 lg:grid-cols-6">
        <StatCard size="compact" :label="t('dashboard.cards.activeEmployees')" :value="dashboard.cards.activeEmployees" />
        <StatCard size="compact" :label="t('dashboard.cards.totalCourses')" :value="dashboard.cards.totalCourses" />
        <StatCard size="compact" :label="t('dashboard.cards.completedAssignments')" :value="dashboard.cards.completedAssignments" />
        <StatCard size="compact" :label="t('dashboard.cards.avgWatchTimeSeconds')" :value="minutes(dashboard.cards.avgWatchTimeSeconds)" suffix=" min" />
        <StatCard size="compact" :label="t('dashboard.cards.newsEngagementPercent')" :value="dashboard.cards.newsEngagementPercent" suffix="%" />
        <StatCard size="compact" :label="t('dashboard.cards.activeSessions')" :value="dashboard.cards.activeSessions" />
      </div>

      <!-- Attention required -->
      <section class="mt-8">
        <h2 class="mb-3 text-h3 text-ink">{{ t('dashboard.attention.title') }}</h2>
        <AppCard v-if="attentionItems.length === 0" class="flex items-center gap-3">
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-success-subtle text-success">
            <Icon name="check-circle" size="17" />
          </span>
          <p class="text-small text-ink-muted">{{ t('dashboard.attention.allClear') }}</p>
        </AppCard>
        <div v-else class="divide-y divide-border rounded-lg border border-border bg-surface">
          <router-link v-for="(item, i) in attentionItems" :key="i" :to="item.to" class="flex items-center justify-between gap-3 p-4 transition-default hover:bg-surface-2">
            <div class="flex items-center gap-3">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" :class="toneChip[item.tone]">
                <Icon :name="item.icon" size="15" />
              </span>
              <p class="text-small text-ink">{{ item.text }}</p>
            </div>
            <span class="flex shrink-0 items-center gap-1 text-caption font-medium text-primary">
              {{ t('common.viewDetails') }}
              <Icon name="chevron-right" size="13" />
            </span>
          </router-link>
        </div>
      </section>

      <!-- Training health -->
      <section class="mt-8">
        <h2 class="mb-3 text-h3 text-ink">{{ t('dashboard.title') }}</h2>
        <TrendChart :title="t('dashboard.charts.watchTimeByDay')" :points="dashboard.charts.watchTimeByDay" />
      </section>

      <!-- Analytics grid -->
      <section class="mt-8">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RankedListCard :title="t('dashboard.charts.courseCompletion')" :items="courseCompletionItems" :empty-text="t('dashboard.empty.courses')" value-suffix="%" />
          <RankedListCard :title="t('dashboard.charts.mostDifficultCourses')" :items="mostDifficultItems" :empty-text="t('dashboard.empty.courses')" value-suffix="%" />
          <RankedListCard :title="t('dashboard.charts.employeeProgress')" :items="employeeProgressItems" :empty-text="t('dashboard.empty.employees')" />
          <RankedListCard :title="t('dashboard.charts.mostEngagedEmployees')" :items="mostEngagedItems" :empty-text="t('dashboard.empty.employees')" value-suffix=" min" />
          <RankedListCard :title="t('dashboard.charts.lowestEngagement')" :items="lowestEngagementItems" :empty-text="t('dashboard.empty.employees')" value-suffix=" min" />
          <RankedListCard :title="t('dashboard.charts.mostSkippedVideos')" :items="mostSkippedItems" :empty-text="t('dashboard.empty.videos')" value-suffix="s" />
          <RankedListCard :title="t('dashboard.charts.mostPausedVideos')" :items="mostPausedItems" :empty-text="t('dashboard.empty.videos')" />
          <RankedListCard :title="t('dashboard.charts.newsEngagement')" :items="newsEngagementItems" :empty-text="t('dashboard.empty.news')" value-suffix="%" />
          <StatusBarList :title="t('dashboard.charts.taskCompletion')" :items="taskCompletionItems" :empty-text="t('dashboard.empty.tasks')" />
        </div>
      </section>
    </template>
  </div>
</template>
