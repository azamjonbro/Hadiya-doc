<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { dashboardApi } from '@/services/dashboard'
import { newsApi } from '@/services/news'
import StatCard from '@/admin/components/dashboard/StatCard.vue'
import RankedListCard from '@/admin/components/dashboard/RankedListCard.vue'
import StatusBarList from '@/admin/components/dashboard/StatusBarList.vue'
import Chart from '@/components/ui/Chart.vue'
import DashboardScopeSwitch from '@/admin/components/dashboard/DashboardScopeSwitch.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const auth = useAuthStore()

const dashboard = ref(null)
const dashboardLoading = ref(true)
const dashboardError = ref('')
// A manager reaching the company dashboard is not an error to display — the
// cached payload covers people they are fenced from, and the answer is the
// team dashboard, which is a link and not a message.
const dashboardScopeBlocked = ref(false)

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
    if (error?.response?.data?.code === 'DASHBOARD_SCOPE_FORBIDDEN') {
      dashboardScopeBlocked.value = true
    } else {
      dashboardError.value = apiErrorText(error)
    }
  } finally {
    dashboardLoading.value = false
  }
}

// Rasm 1's right column: the latest articles with their comment counts.
// The feed already carries likes/comments per row (portal §3).
const newsRows = ref([])
async function loadNews() {
  try {
    newsRows.value = (await newsApi.feed({ limit: 5 })).items
  } catch {
    newsRows.value = []
  }
}

onMounted(() => {
  loadDashboard()
  loadNews()
})

function minutes(seconds) {
  return Math.round((seconds ?? 0) / 60)
}

const attentionItems = computed(() => {
  if (!dashboard.value) return []
  const c = dashboard.value.cards
  const notStartedCount = dashboard.value.charts.employeeProgress.find((b) => b.bucket === '0-25')?.count ?? 0
  const items = []
  if (c.overdueAssignments > 0) {
    items.push({ icon: 'alert-triangle', tone: 'danger', text: t('dashboard.attention.overdue', { count: c.overdueAssignments }), to: '/bos/courses' })
  }
  if (notStartedCount > 0) {
    items.push({ icon: 'users', tone: 'warning', text: t('dashboard.attention.notStarted', { count: notStartedCount }), to: '/bos/users' })
  }
  if (c.avgCompletionPercent < 50) {
    items.push({ icon: 'trending-down', tone: 'warning', text: t('dashboard.attention.lowCompletion', { pct: c.avgCompletionPercent }), to: '/bos/courses' })
  }
  if (c.newsEngagementPercent < 40) {
    items.push({ icon: 'newspaper', tone: 'warning', text: t('dashboard.attention.lowNewsEngagement', { pct: c.newsEngagementPercent }), to: '/bos/news' })
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
// The chart takes {label, value} and leaves the units to the caller, which
// is the only one that knows these are seconds and want to be read as
// minutes.
const watchTimeSeries = computed(() =>
  (dashboard.value?.charts?.watchTimeByDay ?? []).map((point) => ({
    label: new Date(point.date).toLocaleDateString(locale.value, { day: '2-digit', month: '2-digit' }),
    value: point.totalSeconds,
  }))
)

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
  <!-- Rasm 1: the dashboard sits straight on the grey ground; its tiles
       and panels are the white cards. -->
  <div class="mx-auto w-full max-w-[1600px] px-6 py-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-[24px] font-semibold text-ink">{{ t('nav.dashboard') }}</h1>
      <div class="flex flex-wrap items-center gap-3">
        <p v-if="dashboard?.generatedAt" class="text-caption text-ink-faint">
          {{ t('dashboard.generatedAt') }} {{ new Date(dashboard.generatedAt).toLocaleString(locale) }}
          <span v-if="dashboard.stale"> · {{ t('dashboard.stale') }}</span>
        </p>
        <DashboardScopeSwitch v-if="canViewDashboard" />
      </div>
    </div>

    <template v-if="!canViewDashboard">
      <AppCard class="mt-6 text-small text-ink-muted">{{ t('admin.forbidden.message') }}</AppCard>
    </template>

    <template v-else-if="dashboardLoading">
      <div class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton v-for="i in 4" :key="i" class="h-24 w-full rounded-2xl" />
      </div>
      <Skeleton class="mt-6 h-48 w-full rounded-2xl" />
    </template>

    <!-- Fenced, not broken. The company figures cover people this manager
         cannot see; their own team's are one click away. -->
    <AppCard v-else-if="dashboardScopeBlocked" class="mt-6 space-y-3">
      <p class="text-small text-ink">{{ t('dashboard.scope.blocked') }}</p>
      <AppButton size="sm" icon="users" @click="$router.push({ name: 'admin-team-dashboard' })">
        {{ t('dashboard.scope.goToTeam') }}
      </AppButton>
    </AppCard>

    <p v-else-if="dashboardError" class="mt-6 text-small text-danger">{{ dashboardError }}</p>

    <template v-else-if="dashboard">
      <!-- Four tiles -->
      <div class="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard :label="t('dashboard.cards.totalCourses')" :value="dashboard.cards.totalCourses" icon="file-text" tone="primary" />
        <StatCard :label="t('dashboard.cards.totalEmployees')" :value="dashboard.cards.totalEmployees" icon="user" tone="primary" />
        <StatCard :label="t('dashboard.cards.activeEmployees')" :value="dashboard.cards.activeEmployees" icon="users" tone="primary" />
        <StatCard :label="t('dashboard.cards.overdueAssignments')" :value="dashboard.cards.overdueAssignments" icon="alert-triangle" :tone="dashboard.cards.overdueAssignments > 0 ? 'danger' : 'primary'" />
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_minmax(0,0.95fr)]">
        <!-- Left column -->
        <div class="space-y-4">
          <!-- Attention: the reference's "new training requests" row, a
               badge with the count on a pale circle -->
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <div class="flex items-center gap-4">
              <span class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <Icon name="alert-circle" size="20" />
                <span v-if="attentionItems.length" class="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-semibold text-primary-foreground">{{ attentionItems.length }}</span>
              </span>
              <p class="text-[18px] font-medium text-ink">{{ t('dashboard.attention.title') }}</p>
            </div>
            <p v-if="attentionItems.length === 0" class="mt-4 flex items-center gap-2 text-small text-ink-muted">
              <Icon name="check-circle" size="15" class="text-success" />{{ t('dashboard.attention.allClear') }}
            </p>
            <div v-else class="mt-4 divide-y divide-border">
              <router-link v-for="(item, i) in attentionItems" :key="i" :to="item.to" class="flex items-center justify-between gap-3 py-3 transition-default hover:text-primary">
                <div class="flex items-center gap-3">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" :class="toneChip[item.tone]">
                    <Icon :name="item.icon" size="15" />
                  </span>
                  <p class="text-small text-ink">{{ item.text }}</p>
                </div>
                <Icon name="chevron-right" size="14" class="text-ink-faint" />
              </router-link>
            </div>
          </div>

          <!-- Unchecked assignments → grading queue -->
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-[18px] font-medium text-ink">{{ t('grading.title') }}</p>
                <p class="text-[13px] text-ink-muted">{{ t('dashboard.cards.quizAttempts') }}: {{ dashboard.cards.quizAttempts }} · {{ t('dashboard.cards.quizPassRatePercent') }}: {{ dashboard.cards.quizPassRatePercent }}%</p>
              </div>
              <AppButton v-if="auth.hasPermission('quiz:grade')" variant="secondary" @click="$router.push('/bos/grading')">{{ t('grading.title') }} →</AppButton>
            </div>
          </div>

          <!-- Training health -->
          <div class="[&>div]:border-0 [&>div]:p-0 [&>div]:shadow-none rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <Chart
              type="line"
              :title="t('dashboard.charts.watchTimeByDay')"
              :series="watchTimeSeries"
              :format="(seconds) => `${minutes(seconds)} min`"
            />
          </div>
        </div>

        <!-- Right column -->
        <div class="space-y-4">
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <p class="text-[18px] font-medium text-ink">{{ t('dashboard.cards.completedAssignments') }}</p>
            <p class="text-[13px] text-ink-muted">{{ t('dashboard.cards.avgCompletionPercent') }}: {{ dashboard.cards.avgCompletionPercent }}% · {{ t('dashboard.cards.certificatesIssued') }}: {{ dashboard.cards.certificatesIssued }}</p>
            <p class="mt-4 text-[28px] font-semibold text-ink">{{ dashboard.cards.completedAssignments }}</p>
          </div>

          <!-- News comments -->
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-[18px] font-medium text-ink">{{ t('portal.newsDetail.comments') }}</p>
                <p class="text-[13px] text-ink-muted">{{ t('dashboard.cards.newsEngagementPercent') }}: {{ dashboard.cards.newsEngagementPercent }}%</p>
              </div>
              <AppButton variant="secondary" @click="$router.push('/bos/news')">{{ t('nav.news') }} →</AppButton>
            </div>
            <ul class="mt-3 divide-y divide-border">
              <li v-for="row in newsRows" :key="row.id" class="flex items-center gap-4 py-3">
                <span class="h-12 w-20 shrink-0 rounded bg-surface-2 bg-cover bg-center" :style="row.cover ? { backgroundImage: `url(${row.cover})` } : {}"></span>
                <div class="min-w-0 flex-1">
                  <router-link :to="`/news/${row.id}`" class="block truncate text-[15px] text-ink hover:text-primary">{{ row.title }}</router-link>
                  <p class="text-[12px] text-ink-muted">{{ row.comments ?? 0 }} · {{ t('portal.newsDetail.comments').toLowerCase() }} · ♡ {{ row.likes ?? 0 }} · 👁 {{ row.views ?? 0 }}</p>
                </div>
                <span class="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-[12px] font-semibold text-primary-foreground">{{ row.comments ?? 0 }}</span>
              </li>
              <li v-if="!newsRows.length" class="py-6 text-center text-small text-ink-muted">{{ t('dashboard.empty.news') }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Analytics grid -->
      <section class="mt-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RankedListCard :title="t('dashboard.charts.courseCompletion')" :items="courseCompletionItems" :empty-text="t('dashboard.empty.courses')" value-suffix="%" />
          <RankedListCard :title="t('dashboard.charts.mostDifficultCourses')" :items="mostDifficultItems" :empty-text="t('dashboard.empty.courses')" value-suffix="%" />
          <Chart
            type="bar"
            :title="t('dashboard.charts.employeeProgress')"
            :series="employeeProgressItems"
            :empty-text="t('dashboard.empty.employees')"
            height="h-28"
          />
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
