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
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
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

// The live half of the page (rasm 1's left column and "new material"):
// what is waiting on somebody right now. Its own request because it is
// computed per call, unlike the cached figures — and its own failure,
// because a broken inbox must not blank the tiles.
const inbox = ref(null)
const inboxError = ref('')
// Rasm 1's "Мои / Все" switch on the grading card.
const gradingScope = ref('all')
async function loadInbox() {
  try {
    inbox.value = await dashboardApi.inbox()
  } catch (error) {
    if (error?.response?.data?.code !== 'DASHBOARD_SCOPE_FORBIDDEN') inboxError.value = apiErrorText(error)
  }
}

const gradingRows = computed(() => {
  const rows = inbox.value?.grading?.items ?? []
  return gradingScope.value === 'mine' ? rows.filter((row) => row.assignedToMe) : rows
})

// One word for what is waiting on a new hire — the onboarding run when
// there is one, otherwise the account itself.
function employeeState(row) {
  if (!row.isActive) return { key: 'inactive', variant: 'neutral' }
  if (!row.onboarding) return { key: 'noProgram', variant: 'warning' }
  return row.onboarding.status === 'COMPLETED' ? { key: 'onboarded', variant: 'success' } : { key: 'onboarding', variant: 'info' }
}

onMounted(() => {
  loadDashboard()
  loadNews()
  if (canViewDashboard.value) loadInbox()
})

function minutes(seconds) {
  return Math.round((seconds ?? 0) / 60)
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

    <!-- A payload without figures (the cache written before the job ran)
         is "not yet", not a crash. -->
    <AppCard v-else-if="!dashboard?.cards" class="mt-6 text-small text-ink-muted">{{ t('dashboard.loading') }}</AppCard>

    <template v-else>
      <!-- Four tiles -->
      <div class="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard :label="t('dashboard.cards.totalCourses')" :value="dashboard.cards.totalCourses" icon="file-text" tone="primary" :to="tileLinks.totalCourses" />
        <StatCard :label="t('dashboard.cards.totalEmployees')" :value="dashboard.cards.totalEmployees" icon="user" tone="primary" :to="tileLinks.totalEmployees" />
        <StatCard :label="t('dashboard.cards.totalGroups')" :value="dashboard.cards.totalGroups ?? 0" icon="layers" tone="primary" :to="tileLinks.totalGroups" />
        <StatCard :label="t('dashboard.cards.activeEmployees')" :value="dashboard.cards.activeEmployees" icon="users" tone="primary" :to="tileLinks.activeEmployees" />
      </div>

      <p v-if="inboxError" class="mt-4 text-small text-danger">{{ inboxError }}</p>

      <div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <!-- Left column -->
        <div class="space-y-4">
          <!-- Rasm 1's first row: a pale circle with a chat bubble and the
               count on a green badge — what people have asked and nobody
               has answered. -->
          <router-link
            :to="auth.hasPermission('course:read') ? '/bos/courses/questions' : ''"
            class="flex items-center gap-4 rounded-2xl bg-surface px-6 py-5 shadow-sm transition-default hover:bg-surface-hover"
          >
            <span class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <Icon name="message-square" size="20" />
              <span v-if="inbox?.questions?.unanswered" class="absolute -right-1 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-semibold text-primary-foreground">{{ inbox.questions.unanswered }}</span>
            </span>
            <div class="min-w-0">
              <p class="text-[18px] font-medium text-ink">{{ t('dashboard.inbox.questions.title') }}</p>
              <p v-if="!inbox?.questions?.unanswered" class="text-[13px] text-ink-muted">{{ t('dashboard.attention.allClear') }}</p>
            </div>
            <Icon name="chevron-right" size="18" class="ml-auto shrink-0 text-ink-faint" />
          </router-link>

          <!-- Homework waiting to be marked -->
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-[18px] font-medium text-ink">{{ t('dashboard.inbox.grading.title') }}</p>
                <p class="text-[13px] text-ink-muted">{{ t('dashboard.inbox.grading.subtitle') }}</p>
              </div>
              <div v-if="inbox?.grading" class="flex flex-wrap items-center gap-3">
                <div class="flex rounded-full bg-surface-2 p-1 text-[14px]" role="tablist">
                  <button
                    v-for="scope in ['mine', 'all']"
                    :key="scope"
                    type="button"
                    role="tab"
                    :aria-selected="gradingScope === scope"
                    class="rounded-full px-4 py-1.5 transition-default"
                    :class="gradingScope === scope ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'"
                    @click="gradingScope = scope"
                  >
                    {{ t(`dashboard.inbox.grading.${scope}`) }}
                    <span class="ml-1.5 text-ink-faint">{{ inbox.grading[scope] }}</span>
                  </button>
                </div>
                <AppButton variant="secondary" @click="$router.push('/bos/grading')">{{ t('dashboard.inbox.grading.open') }}</AppButton>
              </div>
            </div>
            <template v-if="inbox?.grading">
              <div class="mt-4 grid grid-cols-2 border-b border-border pb-2 text-[13px] text-ink-faint">
                <span>{{ t('dashboard.inbox.grading.colTitle') }}</span>
                <span>{{ t('dashboard.inbox.grading.colUser') }}</span>
              </div>
              <ul v-if="gradingRows.length" class="divide-y divide-border">
                <li v-for="row in gradingRows" :key="row.id">
                  <router-link to="/bos/grading" class="grid grid-cols-2 items-center gap-3 py-3 text-[15px] transition-default hover:text-primary">
                    <span class="truncate text-ink">{{ row.assignmentTitle }}</span>
                    <span class="min-w-0">
                      <span class="block truncate text-ink">{{ row.fullName }}</span>
                      <span class="block truncate text-[12px] text-ink-muted">{{ row.department }}</span>
                    </span>
                  </router-link>
                </li>
              </ul>
              <p v-else class="py-6 text-center text-[15px] text-ink-muted">{{ t('dashboard.inbox.grading.empty') }}</p>
            </template>
            <p v-else-if="inbox" class="mt-4 text-small text-ink-muted">{{ t('admin.forbidden.message') }}</p>
            <Skeleton v-else class="mt-4 h-20 w-full rounded-lg" />
          </div>

          <!-- People who joined this month -->
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-[18px] font-medium text-ink">{{ t('dashboard.inbox.employees.title') }}</p>
                <p class="text-[13px] text-ink-muted">{{ t('dashboard.inbox.employees.subtitle', { count: inbox?.newEmployees?.total ?? 0 }) }}</p>
              </div>
              <AppButton v-if="auth.hasPermission('user:read')" variant="secondary" @click="$router.push('/bos/users')">{{ t('dashboard.inbox.employees.open') }}</AppButton>
            </div>
            <template v-if="inbox">
              <div class="mt-4 grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border pb-2 text-[13px] text-ink-faint">
                <span>{{ t('dashboard.inbox.employees.colEmployee') }}</span>
                <span>{{ t('dashboard.inbox.employees.colFields') }}</span>
                <span>{{ t('dashboard.inbox.employees.colStatus') }}</span>
              </div>
              <ul v-if="inbox.newEmployees.items.length" class="divide-y divide-border">
                <li v-for="row in inbox.newEmployees.items" :key="row.id">
                  <router-link :to="`/bos/users/${row.id}`" class="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 transition-default hover:text-primary">
                    <span class="flex min-w-0 items-center gap-3">
                      <Avatar :name="row.fullName" :src="row.avatar" size="md" />
                      <span class="min-w-0">
                        <span class="block truncate text-[15px] text-ink">{{ row.fullName }}</span>
                        <span class="block truncate text-[12px] text-ink-muted">{{ row.department }}</span>
                      </span>
                    </span>
                    <span class="text-[15px] text-ink">{{ t('dashboard.inbox.employees.fields', { filled: row.filledFields, total: row.totalFields }) }}</span>
                    <Badge :variant="employeeState(row).variant" dot>{{ t(`dashboard.inbox.employees.status.${employeeState(row).key}`) }}</Badge>
                  </router-link>
                </li>
              </ul>
              <p v-else class="py-6 text-center text-[15px] text-ink-muted">{{ t('dashboard.inbox.employees.empty') }}</p>
            </template>
            <Skeleton v-else class="mt-4 h-32 w-full rounded-lg" />
          </div>
        </div>

        <!-- Right column -->
        <div class="space-y-4">
          <!-- Material written this week -->
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <p class="text-[18px] font-medium text-ink">{{ t('dashboard.inbox.material.title') }}</p>
            <p class="text-[13px] text-ink-muted">{{ t('dashboard.inbox.material.subtitle') }}</p>
            <template v-if="inbox">
              <ul v-if="inbox.newCourses.length" class="mt-3 divide-y divide-border">
                <li v-for="row in inbox.newCourses" :key="row.id">
                  <router-link :to="`/bos/courses/${row.id}`" class="flex items-center gap-4 py-3 transition-default hover:text-primary">
                    <span class="h-12 w-20 shrink-0 rounded bg-surface-2 bg-cover bg-center" :style="row.cover ? { backgroundImage: `url(${row.cover})` } : {}"></span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[15px] text-ink">{{ row.title }}</span>
                      <span class="block truncate text-[12px] text-ink-muted">{{ row.authors.join(', ') }} · {{ new Date(row.createdAt).toLocaleDateString(locale) }}</span>
                    </span>
                    <Badge v-if="row.status !== 'PUBLISHED'" variant="neutral" size="sm">{{ t('courses.status.' + row.status.toLowerCase()) }}</Badge>
                  </router-link>
                </li>
              </ul>
              <p v-else class="mt-4 border-t border-border py-6 text-center text-[15px] text-ink-muted">{{ t('dashboard.inbox.material.empty') }}</p>
            </template>
            <Skeleton v-else class="mt-4 h-20 w-full rounded-lg" />
          </div>

          <!-- News comments -->
          <div class="rounded-2xl bg-surface px-6 py-5 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-[18px] font-medium text-ink">{{ t('dashboard.inbox.comments.title') }}</p>
                <p class="text-[13px] text-ink-muted">{{ t('dashboard.inbox.comments.subtitle', { count: inbox?.comments?.newThisWeek ?? 0 }) }}</p>
              </div>
              <AppButton v-if="auth.hasPermission('news:manage')" variant="secondary" @click="$router.push('/bos/news/comments')">{{ t('dashboard.inbox.comments.open') }}</AppButton>
            </div>
            <ul class="mt-3 divide-y divide-border">
              <li v-for="row in newsRows" :key="row.id" class="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-default hover:bg-surface-2">
                <span class="h-12 w-20 shrink-0 rounded bg-surface-2 bg-cover bg-center" :style="row.cover ? { backgroundImage: `url(${row.cover})` } : {}"></span>
                <div class="min-w-0 flex-1">
                  <router-link :to="`/bos/news/${row.id}`" class="block truncate text-[15px] text-ink hover:text-primary">{{ row.title }}</router-link>
                  <p class="text-[12px] text-ink-muted">{{ t('dashboard.inbox.comments.count', { count: row.comments ?? 0 }) }}</p>
                </div>
                <!-- The badge gives way to the button on hover, as in rasm 1 -->
                <span class="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-[12px] font-semibold text-primary-foreground group-hover:hidden">{{ row.comments ?? 0 }}</span>
                <AppButton variant="secondary" size="sm" class="hidden group-hover:inline-flex" @click="$router.push(`/bos/news/${row.id}`)">{{ t('dashboard.inbox.comments.goto') }}</AppButton>
              </li>
              <li v-if="!newsRows.length" class="py-6 text-center text-[15px] text-ink-muted">{{ t('dashboard.empty.news') }}</li>
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
