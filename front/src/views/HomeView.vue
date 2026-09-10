<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import { usersApi } from '@/services/users'
import { tasksApi } from '@/services/tasks'
import { eventsApi } from '@/services/events'
import { newsApi } from '@/services/news'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const loading = ref(true)
const assignments = ref([])
const tasks = ref([])
const events = ref([])
const news = ref([])
const heroTopic = ref(null)
const progressByCourseId = ref({})
const learningStats = ref({ coursesCompleted: 0, hoursLearned: 0, videosWatched: 0, streakDays: 0 })

function courseProgress(courseId) {
  return progressByCourseId.value[courseId]?.completionPercent ?? 0
}

const firstName = computed(() => auth.user?.fullName?.split(' ')[0] ?? '')

const greetingKey = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'dashboard.greeting.morning'
  if (hour < 18) return 'dashboard.greeting.afternoon'
  return 'dashboard.greeting.evening'
})

const mandatoryAssignments = computed(() => assignments.value.filter((a) => a.mandatory && a.status === 'ACTIVE'))
const completedCount = computed(() => assignments.value.filter((a) => a.status === 'COMPLETED').length)

const heroAssignment = computed(() => {
  const active = mandatoryAssignments.value.length ? mandatoryAssignments.value : assignments.value.filter((a) => a.status === 'ACTIVE')
  return [...active].sort((a, b) => new Date(a.deadline ?? 8640000000000000) - new Date(b.deadline ?? 8640000000000000))[0] ?? null
})

const heroProgress = computed(() => (heroAssignment.value ? courseProgress(heroAssignment.value.courseId) : 0))

const overallCompletion = computed(() => {
  if (assignments.value.length === 0) return 0
  const sum = assignments.value.reduce((acc, a) => acc + (a.status === 'COMPLETED' ? 100 : courseProgress(a.courseId)), 0)
  return Math.round(sum / assignments.value.length)
})

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function relativeDay(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const time = date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
  if (isSameDay(date, now)) return `${t('common.today')} ${time}`
  if (isSameDay(date, tomorrow)) return `${t('common.tomorrow')} ${time}`
  return date.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

const todayItems = computed(() => {
  const now = Date.now()
  const horizon = now + 2 * 24 * 60 * 60 * 1000
  const fromTasks = tasks.value
    .filter((tsk) => tsk.deadline && tsk.status !== 'COMPLETED' && tsk.status !== 'CANCELLED' && new Date(tsk.deadline).getTime() <= horizon)
    .map((tsk) => ({ id: `task-${tsk.id}`, icon: 'check-square', title: tsk.title, deadline: tsk.deadline, kind: 'task', urgent: tsk.effectiveStatus === 'OVERDUE' }))
  const fromCourses = assignments.value
    .filter((a) => a.status === 'ACTIVE' && a.deadline && new Date(a.deadline).getTime() <= horizon)
    .map((a) => ({ id: `course-${a.id}`, icon: 'graduation-cap', title: a.course?.title, deadline: a.deadline, kind: 'course', urgent: a.isOverdue, courseId: a.courseId }))
  return [...fromTasks, ...fromCourses].sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 4)
})

function badgeVariant(a) {
  if (a.isExpired) return 'danger'
  if (a.isOverdue) return 'warning'
  return 'primary'
}
function badgeLabel(a) {
  if (a.isExpired) return t('courses.badges.expired')
  if (a.isOverdue) return t('courses.badges.overdue')
  return t('courses.badges.onTrack')
}

async function load() {
  loading.value = true
  try {
    const [myAssignments, taskResult, eventResult, newsResult, stats] = await Promise.all([
      coursesApi.myAssignments(auth.user.id),
      tasksApi.listMy({}),
      eventsApi.calendar({}),
      newsApi.feed({}),
      usersApi.learningStats(auth.user.id),
    ])

    const courses = await Promise.all(myAssignments.map((a) => coursesApi.getById(a.courseId)))
    assignments.value = myAssignments.map((a, i) => ({ ...a, course: courses[i] }))
    tasks.value = taskResult.items
    events.value = eventResult.slice(0, 4)
    news.value = newsResult.items.slice(0, 3)
    learningStats.value = stats

    const progressEntries = await Promise.all(
      myAssignments.map((a) => coursesApi.getMyProgress(a.courseId).then((p) => [a.courseId, p]))
    )
    progressByCourseId.value = Object.fromEntries(progressEntries)

    if (heroAssignment.value) {
      try {
        const topics = await coursesApi.listTopics(heroAssignment.value.courseId)
        heroTopic.value = topics[0] ?? null
      } catch {
        heroTopic.value = null
      }
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-h1 text-ink">{{ t(greetingKey) }}, {{ firstName }}</h1>
        <p class="mt-1 text-body text-ink-muted">{{ t('dashboard.subtitle') }}</p>
      </div>
    </div>

    <!-- Today -->
    <section class="mt-6">
      <h2 class="mb-3 text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('dashboard.today.title') }}</h2>
      <div v-if="loading" class="flex gap-3 overflow-x-auto">
        <Skeleton v-for="i in 3" :key="i" class="h-16 w-64 shrink-0" />
      </div>
      <div v-else-if="todayItems.length" class="flex gap-3 overflow-x-auto pb-1">
        <button
          v-for="item in todayItems"
          :key="item.id"
          type="button"
          class="flex w-64 shrink-0 items-center gap-3 rounded-md border p-3 text-left transition-default hover:bg-surface-2"
          :class="item.urgent ? 'border-danger-subtle bg-danger/5' : 'border-border bg-surface'"
          @click="item.kind === 'task' ? router.push('/tasks') : router.push(`/courses/${item.courseId}`)"
        >
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded" :class="item.urgent ? 'bg-danger/10 text-danger' : 'bg-primary-subtle text-primary'">
            <Icon :name="item.icon" size="16" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-small font-medium text-ink">{{ item.title }}</p>
            <p class="text-caption" :class="item.urgent ? 'text-danger' : 'text-ink-faint'">{{ relativeDay(item.deadline) }}</p>
          </div>
        </button>
      </div>
      <AppCard v-else class="flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-full bg-success-subtle text-success">
          <Icon name="check-circle" size="17" />
        </span>
        <p class="text-small text-ink-muted">{{ t('dashboard.today.empty') }}</p>
      </AppCard>
    </section>

    <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Main column -->
      <div class="space-y-8 lg:col-span-2">
        <!-- Continue learning -->
        <section v-if="loading">
          <Skeleton class="h-56 w-full" />
        </section>
        <section v-else-if="heroAssignment">
          <h2 class="mb-3 text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('dashboard.continueLearning.title') }}</h2>
          <AppCard padding="none" hover class="cursor-pointer overflow-hidden" @click="router.push(`/courses/${heroAssignment.courseId}`)">
            <div class="flex flex-col sm:flex-row">
              <div
                class="flex h-40 shrink-0 items-center justify-center bg-primary sm:h-auto sm:w-64"
                :style="heroAssignment.course?.cover ? `background-image:url(${heroAssignment.course.cover});background-size:cover;background-position:center` : ''"
              >
                <Icon v-if="!heroAssignment.course?.cover" name="graduation-cap" size="36" class="text-primary-foreground/80" />
              </div>
              <div class="flex flex-1 flex-col justify-between p-6">
                <div>
                  <div class="flex items-center gap-2">
                    <Badge variant="primary" dot>{{ t('courses.mandatory') }}</Badge>
                    <Badge v-if="heroAssignment.deadline" :variant="badgeVariant(heroAssignment)">{{ badgeLabel(heroAssignment) }}</Badge>
                  </div>
                  <h3 class="mt-2.5 text-h2 text-ink">{{ heroAssignment.course?.title }}</h3>
                  <p v-if="heroTopic" class="mt-1 text-small text-ink-muted">{{ heroTopic.title }}</p>
                </div>
                <div class="mt-5">
                  <div class="mb-1.5 flex items-center justify-between text-small">
                    <span class="text-ink-muted">{{ heroProgress }}% {{ t('videos.completed') }}</span>
                  </div>
                  <ProgressBar :value="heroProgress" />
                  <AppButton class="mt-4" icon="arrow-right" icon-position="right">{{ t('dashboard.continueLearning.cta') }}</AppButton>
                </div>
              </div>
            </div>
          </AppCard>
        </section>

        <!-- Mandatory training -->
        <section>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('dashboard.mandatory.title') }}</h2>
            <router-link to="/courses" class="text-small font-medium text-primary hover:underline">{{ t('dashboard.mandatory.viewAll') }}</router-link>
          </div>
          <div v-if="loading" class="flex gap-4 overflow-x-auto">
            <Skeleton v-for="i in 3" :key="i" class="h-44 w-72 shrink-0" />
          </div>
          <div v-else-if="mandatoryAssignments.length" class="flex gap-4 overflow-x-auto pb-1">
            <AppCard
              v-for="a in mandatoryAssignments"
              :key="a.id"
              padding="none"
              hover
              class="w-72 shrink-0 cursor-pointer overflow-hidden"
              @click="router.push(`/courses/${a.courseId}`)"
            >
              <div
                class="flex h-28 items-center justify-center bg-surface-2 text-ink-faint"
                :style="a.course?.cover ? `background-image:url(${a.course.cover});background-size:cover;background-position:center` : ''"
              >
                <Icon v-if="!a.course?.cover" name="book-open" size="24" />
              </div>
              <div class="p-4">
                <Badge :variant="badgeVariant(a)" size="sm">{{ badgeLabel(a) }}</Badge>
                <h3 class="mt-2 line-clamp-2 text-small font-semibold text-ink">{{ a.course?.title }}</h3>
                <p v-if="a.deadline" class="mt-1 text-caption text-ink-faint">{{ t('courses.deadline') }}: {{ new Date(a.deadline).toLocaleDateString(locale) }}</p>
                <ProgressBar class="mt-3" :value="courseProgress(a.courseId)" size="sm" />
              </div>
            </AppCard>
          </div>
          <EmptyState v-else icon="graduation-cap" :title="t('courses.noAssignments')" />
        </section>

        <!-- Latest news -->
        <section>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('dashboard.news.title') }}</h2>
            <router-link to="/news" class="text-small font-medium text-primary hover:underline">{{ t('dashboard.news.viewAll') }}</router-link>
          </div>
          <div v-if="loading" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton v-for="i in 3" :key="i" class="h-40 w-full" />
          </div>
          <div v-else-if="news.length" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AppCard
              v-for="item in news"
              :key="item.id"
              padding="none"
              hover
              class="cursor-pointer overflow-hidden"
              @click="router.push(`/news/${item.id}`)"
            >
              <div class="flex h-24 items-center justify-center bg-surface-2 text-ink-faint">
                <Icon name="newspaper" size="20" />
              </div>
              <div class="p-3.5">
                <p class="line-clamp-2 text-small font-medium text-ink">{{ item.title }}</p>
                <p class="mt-1.5 text-caption text-ink-faint">{{ new Date(item.publishAt).toLocaleDateString(locale) }}</p>
              </div>
            </AppCard>
          </div>
          <EmptyState v-else icon="newspaper" :title="t('news.empty')" />
        </section>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- My progress -->
        <AppCard>
          <h2 class="text-small font-semibold text-ink">{{ t('dashboard.progress.title') }}</h2>
          <div class="mt-4 flex justify-center">
            <ProgressRing v-if="!loading" :value="overallCompletion" :size="128" />
            <Skeleton v-else class="h-32 w-32 rounded-full" />
          </div>
          <div class="mt-5 grid grid-cols-2 gap-3 text-center">
            <div class="rounded-md bg-surface-2 py-2.5">
              <p class="text-h3 text-ink">{{ completedCount }}</p>
              <p class="text-caption text-ink-faint">{{ t('dashboard.progress.coursesCompleted') }}</p>
            </div>
            <div class="rounded-md bg-surface-2 py-2.5">
              <p class="text-h3 text-ink">{{ learningStats.hoursLearned }}</p>
              <p class="text-caption text-ink-faint">{{ t('dashboard.progress.hoursLearned') }}</p>
            </div>
            <div class="rounded-md bg-surface-2 py-2.5">
              <p class="text-h3 text-ink">{{ learningStats.videosWatched }}</p>
              <p class="text-caption text-ink-faint">{{ t('dashboard.progress.videosWatched') }}</p>
            </div>
            <div class="rounded-md bg-surface-2 py-2.5">
              <p class="flex items-center justify-center gap-1 text-h3 text-ink">
                <Icon name="flame" size="16" class="text-warning" />{{ learningStats.streakDays }}
              </p>
              <p class="text-caption text-ink-faint">{{ t('dashboard.progress.streak') }}</p>
            </div>
          </div>
        </AppCard>

        <!-- Tasks -->
        <AppCard padding="none">
          <div class="flex items-center justify-between px-5 pt-4">
            <h2 class="text-small font-semibold text-ink">{{ t('dashboard.tasks.title') }}</h2>
            <router-link to="/tasks" class="text-caption font-medium text-primary hover:underline">{{ t('dashboard.tasks.viewAll') }}</router-link>
          </div>
          <div class="mt-3 divide-y divide-border">
            <div v-if="loading" class="space-y-3 p-4">
              <Skeleton v-for="i in 3" :key="i" class="h-4 w-full" />
            </div>
            <template v-else-if="tasks.length">
              <div v-for="tsk in tasks.slice(0, 5)" :key="tsk.id" class="flex items-center gap-3 px-5 py-3">
                <span
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  :class="tsk.status === 'COMPLETED' ? 'border-success bg-success text-white' : 'border-border-strong'"
                >
                  <Icon v-if="tsk.status === 'COMPLETED'" name="check" size="10" />
                </span>
                <p class="min-w-0 flex-1 truncate text-small" :class="tsk.status === 'COMPLETED' ? 'text-ink-faint line-through' : 'text-ink'">{{ tsk.title }}</p>
              </div>
            </template>
            <p v-else class="px-5 py-6 text-center text-small text-ink-faint">{{ t('tasks.empty') }}</p>
          </div>
          <div class="h-4" />
        </AppCard>

        <!-- Upcoming events -->
        <AppCard padding="none">
          <div class="flex items-center justify-between px-5 pt-4">
            <h2 class="text-small font-semibold text-ink">{{ t('dashboard.events.title') }}</h2>
            <router-link to="/events" class="text-caption font-medium text-primary hover:underline">{{ t('dashboard.events.viewAll') }}</router-link>
          </div>
          <div class="mt-3 space-y-4 px-5 pb-5">
            <div v-if="loading" class="space-y-3">
              <Skeleton v-for="i in 3" :key="i" class="h-10 w-full" />
            </div>
            <template v-else-if="events.length">
              <div v-for="ev in events" :key="ev.id" class="flex gap-3">
                <div class="flex w-11 shrink-0 flex-col items-center">
                  <span class="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-primary">
                    <Icon name="calendar" size="15" />
                  </span>
                </div>
                <div class="min-w-0 flex-1 pb-1">
                  <p class="truncate text-small font-medium text-ink">{{ ev.title }}</p>
                  <p class="text-caption text-ink-faint">{{ relativeDay(ev.startAt) }}<template v-if="ev.location"> · {{ ev.location }}</template></p>
                </div>
              </div>
            </template>
            <p v-else class="text-center text-small text-ink-faint">{{ t('events.empty') }}</p>
          </div>
        </AppCard>
      </div>
    </div>
  </div>
</template>
