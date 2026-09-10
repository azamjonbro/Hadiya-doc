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
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-h1 text-ink">{{ t(greetingKey) }}, {{ firstName }}</h1>
        <p class="mt-1 text-body text-ink-muted">{{ t('dashboard.subtitle') }}</p>
      </div>
    </div>

    <!-- Continue Learning (Hero) -->
    <section v-if="heroAssignment" class="mt-8">
      <AppCard padding="none" hover class="cursor-pointer overflow-hidden border border-border shadow-sm" @click="router.push(`/courses/${heroAssignment.courseId}`)">
        <div class="flex flex-col sm:flex-row">
          <div
            class="flex h-48 shrink-0 items-center justify-center bg-surface-2 sm:h-auto sm:w-1/3"
            :style="heroAssignment.course?.cover ? `background-image:url(${heroAssignment.course.cover});background-size:cover;background-position:center` : ''"
          >
            <Icon v-if="!heroAssignment.course?.cover" name="graduation-cap" size="48" class="text-ink-faint" />
          </div>
          <div class="flex flex-1 flex-col justify-between p-6 sm:p-8">
            <div>
              <div class="flex items-center gap-2 mb-3">
                <Badge variant="primary">{{ t('dashboard.continueLearning.title') }}</Badge>
                <Badge v-if="heroAssignment.deadline" :variant="badgeVariant(heroAssignment)">{{ badgeLabel(heroAssignment) }}</Badge>
              </div>
              <h3 class="text-h2 text-ink leading-tight">{{ heroAssignment.course?.title }}</h3>
              <p v-if="heroTopic" class="mt-2 text-body text-ink-muted">{{ heroTopic.title }}</p>
            </div>
            <div class="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="flex-1 max-w-sm">
                <div class="mb-2 flex items-center justify-between text-small font-medium">
                  <span class="text-ink">{{ heroProgress }}% {{ t('videos.completed') }}</span>
                </div>
                <ProgressBar :value="heroProgress" size="md" />
              </div>
              <AppButton icon="play" icon-position="left">{{ t('dashboard.continueLearning.cta') }}</AppButton>
            </div>
          </div>
        </div>
      </AppCard>
    </section>

    <!-- Main Dashboard Grid -->
    <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
      
      <!-- To Do (Mandatory & Tasks) - Takes 3 columns -->
      <div class="space-y-8 lg:col-span-3">
        <!-- Mandatory / To Do -->
        <section>
          <div class="mb-4 flex items-center justify-between border-b border-border pb-2">
            <h2 class="text-h3 text-ink">{{ t('dashboard.mandatory.title') }}</h2>
            <router-link to="/courses" class="text-small font-medium text-primary hover:underline">{{ t('dashboard.mandatory.viewAll') }}</router-link>
          </div>
          <div v-if="loading" class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="i in 3" :key="i" class="h-44 w-full" />
          </div>
          <div v-else-if="mandatoryAssignments.length" class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AppCard
              v-for="a in mandatoryAssignments"
              :key="a.id"
              padding="none"
              hover
              class="cursor-pointer overflow-hidden border border-border shadow-sm flex flex-col"
              @click="router.push(`/courses/${a.courseId}`)"
            >
              <div
                class="flex h-32 shrink-0 items-center justify-center bg-surface-2 text-ink-faint"
                :style="a.course?.cover ? `background-image:url(${a.course.cover});background-size:cover;background-position:center` : ''"
              >
                <Icon v-if="!a.course?.cover" name="book-open" size="24" />
              </div>
              <div class="flex flex-1 flex-col p-4">
                <div class="mb-2">
                  <Badge :variant="badgeVariant(a)" size="sm">{{ badgeLabel(a) }}</Badge>
                </div>
                <h3 class="line-clamp-2 text-small font-semibold text-ink mb-2">{{ a.course?.title }}</h3>
                <div class="mt-auto pt-2 border-t border-border border-dashed">
                  <p v-if="a.deadline" class="text-caption text-ink-muted mb-2 flex items-center gap-1.5"><Icon name="clock" size="12"/>{{ new Date(a.deadline).toLocaleDateString(locale) }}</p>
                  <ProgressBar :value="courseProgress(a.courseId)" size="sm" />
                </div>
              </div>
            </AppCard>
          </div>
          <EmptyState v-else icon="check-circle" :title="t('courses.noAssignments')" />
        </section>

        <!-- Tasks & Events Row -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section>
            <div class="mb-4 flex items-center justify-between border-b border-border pb-2">
              <h2 class="text-h3 text-ink">{{ t('dashboard.tasks.title') }}</h2>
              <router-link to="/tasks" class="text-small font-medium text-primary hover:underline">{{ t('dashboard.tasks.viewAll') }}</router-link>
            </div>
            <AppCard padding="none" class="border border-border shadow-sm">
              <div class="divide-y divide-border">
                <div v-if="loading" class="space-y-3 p-4">
                  <Skeleton v-for="i in 3" :key="i" class="h-4 w-full" />
                </div>
                <template v-else-if="tasks.length">
                  <div v-for="tsk in tasks.slice(0, 5)" :key="tsk.id" class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-default cursor-pointer" @click="router.push('/tasks')">
                    <span
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                      :class="tsk.status === 'COMPLETED' ? 'border-success bg-success text-success-foreground' : 'border-border-strong'"
                    >
                      <Icon v-if="tsk.status === 'COMPLETED'" name="check" size="12" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-small" :class="tsk.status === 'COMPLETED' ? 'text-ink-faint line-through' : 'text-ink font-medium'">{{ tsk.title }}</p>
                      <p v-if="tsk.deadline" class="text-caption text-ink-muted mt-0.5">{{ new Date(tsk.deadline).toLocaleDateString(locale) }}</p>
                    </div>
                  </div>
                </template>
                <p v-else class="px-4 py-8 text-center text-small text-ink-faint">{{ t('tasks.empty') }}</p>
              </div>
            </AppCard>
          </section>

          <section>
            <div class="mb-4 flex items-center justify-between border-b border-border pb-2">
              <h2 class="text-h3 text-ink">{{ t('dashboard.events.title') }}</h2>
              <router-link to="/events" class="text-small font-medium text-primary hover:underline">{{ t('dashboard.events.viewAll') }}</router-link>
            </div>
            <AppCard padding="none" class="border border-border shadow-sm">
              <div class="divide-y divide-border">
                <div v-if="loading" class="space-y-3 p-4">
                  <Skeleton v-for="i in 3" :key="i" class="h-10 w-full" />
                </div>
                <template v-else-if="events.length">
                  <div v-for="ev in events.slice(0, 4)" :key="ev.id" class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-default cursor-pointer" @click="router.push('/events')">
                    <div class="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded bg-primary-subtle text-primary">
                      <span class="text-[10px] font-bold uppercase leading-none">{{ new Date(ev.startAt).toLocaleDateString(locale, { month: 'short' }) }}</span>
                      <span class="text-small font-bold leading-none mt-0.5">{{ new Date(ev.startAt).getDate() }}</span>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-small font-medium text-ink">{{ ev.title }}</p>
                      <p class="text-caption text-ink-muted mt-0.5 truncate">{{ ev.location || t('events.online') }}</p>
                    </div>
                  </div>
                </template>
                <p v-else class="px-4 py-8 text-center text-small text-ink-faint">{{ t('events.empty') }}</p>
              </div>
            </AppCard>
          </section>
        </div>
      </div>

      <!-- Right Column (Stats & News) - Takes 1 column -->
      <div class="space-y-8">
        <!-- My Progress Widget -->
        <section>
          <div class="mb-4 border-b border-border pb-2">
            <h2 class="text-h3 text-ink">{{ t('dashboard.progress.title') }}</h2>
          </div>
          <AppCard class="border border-border shadow-sm text-center">
            <div class="flex justify-center mb-4">
              <ProgressRing v-if="!loading" :value="overallCompletion" :size="100" />
              <Skeleton v-else class="h-24 w-24 rounded-full" />
            </div>
            <div class="grid grid-cols-2 gap-px bg-border rounded-md overflow-hidden border border-border">
              <div class="bg-surface py-3 px-2">
                <p class="text-h2 text-primary">{{ completedCount }}</p>
                <p class="text-caption text-ink-muted leading-tight mt-1">{{ t('dashboard.progress.coursesCompleted') }}</p>
              </div>
              <div class="bg-surface py-3 px-2">
                <p class="text-h2 text-primary">{{ learningStats.streakDays }}</p>
                <p class="text-caption text-ink-muted leading-tight mt-1">{{ t('dashboard.progress.streak') }}</p>
              </div>
            </div>
          </AppCard>
        </section>

        <!-- News Widget -->
        <section>
          <div class="mb-4 flex items-center justify-between border-b border-border pb-2">
            <h2 class="text-h3 text-ink">{{ t('dashboard.news.title') }}</h2>
            <router-link to="/news" class="text-small font-medium text-primary hover:underline">{{ t('dashboard.news.viewAll') }}</router-link>
          </div>
          <div v-if="loading" class="space-y-4">
            <Skeleton v-for="i in 2" :key="i" class="h-20 w-full" />
          </div>
          <div v-else-if="news.length" class="space-y-4">
            <AppCard
              v-for="item in news"
              :key="item.id"
              padding="none"
              hover
              class="flex cursor-pointer overflow-hidden border border-border shadow-sm h-24"
              @click="router.push(`/news/${item.id}`)"
            >
              <div class="flex w-20 shrink-0 items-center justify-center bg-surface-2 text-ink-faint border-r border-border">
                <Icon name="newspaper" size="20" />
              </div>
              <div class="flex flex-col justify-center p-3 flex-1 min-w-0">
                <p class="line-clamp-2 text-small font-medium text-ink leading-snug">{{ item.title }}</p>
                <p class="mt-1 text-caption text-ink-muted">{{ new Date(item.publishAt).toLocaleDateString(locale) }}</p>
              </div>
            </AppCard>
          </div>
          <EmptyState v-else icon="newspaper" :title="t('news.empty')" />
        </section>
      </div>
    </div>
  </div>
</template>
