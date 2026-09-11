<script setup>
/**
 * "My courses" (docs/v4/06-learner-portal-reference.md §1).
 *
 * Two tabs, not four: what is assigned to me and what I have finished.
 * The catalog is its own page now (/catalog) — mixing "things I must do"
 * with "things I could browse" in one list is what made the old page read
 * as a shop. "Overdue" is a status on a card, not a tab, because a person
 * looks for the course, then notices it is late — not the other way round.
 *
 * Learning paths sit in the same list as courses (the reference shows
 * "Траектория обучения" cards between course cards): to the person it is
 * one queue of things to get through.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import { pathsApi } from '@/services/paths'
import PortalHero from '@/components/portal/PortalHero.vue'
import PortalBar from '@/components/portal/PortalBar.vue'
import PillTabs from '@/components/portal/PillTabs.vue'
import SearchField from '@/components/portal/SearchField.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const assignments = ref([])
const paths = ref([])
const progressByCourseId = ref({})
const search = ref('')
const activeTab = ref('assigned')

function courseProgress(courseId) {
  return progressByCourseId.value[courseId]?.completionPercent ?? 0
}

// One shape for a course assignment and a path enrollment, so the
// template renders a single card kind.
const items = computed(() => {
  const courseItems = assignments.value.map((a) => ({
    key: `c-${a.id}`,
    kind: 'course',
    title: a.course?.title ?? '',
    cover: a.course?.cover ?? '',
    to: `/courses/${a.courseId}`,
    completed: a.status === 'COMPLETED',
    percent: a.status === 'COMPLETED' ? 100 : courseProgress(a.courseId),
    overdueSince: a.isOverdue && a.status !== 'COMPLETED' ? a.deadline : null,
    expired: Boolean(a.isExpired),
    started: courseProgress(a.courseId) > 0,
    typeLabel: t('portal.courses.typeCourse'),
    sortAt: new Date(a.assignedAt ?? 0).getTime(),
  }))
  const pathItems = paths.value
    .filter((p) => p.enrollment)
    .map((p) => ({
      key: `p-${p.id}`,
      kind: 'path',
      title: p.title,
      cover: p.cover ?? '',
      to: `/paths/${p.id}`,
      completed: p.enrollment.status === 'COMPLETED',
      percent: p.enrollment.completionPercent ?? 0,
      overdueSince: null,
      expired: false,
      started: (p.enrollment.completionPercent ?? 0) > 0,
      typeLabel: t('portal.courses.typePath'),
      doneCount: p.enrollment.completedRequired ?? null,
      totalCount: p.requiredCount ?? p.totalRequired ?? null,
      sortAt: new Date(p.enrollment.enrolledAt ?? p.enrollment.createdAt ?? 0).getTime(),
    }))
  return [...courseItems, ...pathItems].sort((a, b) => b.sortAt - a.sortAt)
})

const assigned = computed(() => items.value.filter((i) => !i.completed))
const completed = computed(() => items.value.filter((i) => i.completed))

const tabs = computed(() => [
  { value: 'assigned', label: t('portal.courses.assigned'), count: assigned.value.length },
  { value: 'completed', label: t('portal.courses.completed'), count: completed.value.length },
])

const visible = computed(() => {
  const list = activeTab.value === 'completed' ? completed.value : assigned.value
  const q = search.value.trim().toLowerCase()
  return q ? list.filter((i) => i.title.toLowerCase().includes(q)) : list
})

function formatDate(value) {
  return new Date(value).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [myAssignments, myPaths] = await Promise.all([coursesApi.myAssignments(auth.user.id), pathsApi.list().catch(() => [])])
    const courses = await Promise.all(myAssignments.map((a) => coursesApi.getById(a.courseId)))
    assignments.value = myAssignments.map((a, i) => ({ ...a, course: courses[i] }))
    paths.value = myPaths
    const progressEntries = await Promise.all(
      myAssignments.map((a) => coursesApi.getMyProgress(a.courseId).then((p) => [a.courseId, p]).catch(() => [a.courseId, null])),
    )
    progressByCourseId.value = Object.fromEntries(progressEntries)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-bg pb-12">
    <PortalHero :title="t('portal.nav.myCourses')" image="courses" />

    <PortalBar>
      <PillTabs v-model="activeTab" :tabs="tabs" />
      <SearchField v-model="search" class="ml-auto" />
    </PortalBar>

    <div class="mx-auto w-full max-w-[1140px] px-4 pt-10">
      <p v-if="errorMessage" class="mb-6 text-small text-danger">{{ errorMessage }}</p>

      <div v-if="loading" class="space-y-4">
        <Skeleton v-for="i in 3" :key="i" class="h-[180px] w-full rounded-lg" />
      </div>

      <template v-else>
        <ul v-if="visible.length" class="space-y-4">
          <li v-for="item in visible" :key="item.key">
            <article
              class="flex cursor-pointer gap-7 rounded-lg bg-surface p-7 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-default hover:shadow-md"
              @click="router.push(item.to)"
            >
              <div class="relative h-[124px] w-[224px] shrink-0 overflow-hidden rounded bg-surface-2">
                <img v-if="item.cover" :src="item.cover" alt="" class="h-full w-full object-cover" />
                <div v-else class="flex h-full w-full items-center justify-center bg-slate-700 text-white/70">
                  <Icon :name="item.kind === 'path' ? 'layers' : 'book-open'" size="40" />
                </div>
              </div>

              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-start justify-between gap-4">
                  <p class="text-caption text-ink-muted">{{ item.typeLabel }}</p>
                  <span
                    v-if="item.overdueSince"
                    class="inline-flex shrink-0 items-center gap-1 rounded bg-danger-subtle px-2 py-0.5 text-[12px] text-danger"
                  >
                    <Icon name="flame" size="12" />
                    {{ t('portal.courses.overdueSince', { date: formatDate(item.overdueSince) }) }}
                  </span>
                  <span v-else-if="item.expired" class="shrink-0 text-[13px] font-semibold text-danger">{{ t('courses.badges.expired') }}</span>
                  <span v-else-if="item.completed" class="shrink-0 text-[13px] font-semibold text-ink">
                    {{ item.percent >= 100 ? t('portal.courses.completedViewed') : t('courses.badges.completed') }}
                  </span>
                  <span v-else class="shrink-0 text-[13px] font-semibold text-ink">
                    {{ item.started ? t('courses.badges.onTrack') : t('portal.courses.notStarted') }}
                  </span>
                </div>

                <h2 class="mt-1 text-[20px] font-semibold leading-snug text-ink">{{ item.title }}</h2>

                <div v-if="!item.completed" class="mt-auto pt-4">
                  <template v-if="item.kind === 'path' && item.totalCount !== null">
                    <p class="text-small text-ink">{{ t('portal.courses.pathProgress', { done: item.doneCount ?? 0, total: item.totalCount }) }}</p>
                    <div class="mt-2 h-1.5 w-full max-w-[480px] overflow-hidden rounded-full bg-surface-hover">
                      <div class="h-full rounded-full bg-primary" :style="`width:${item.percent}%`" />
                    </div>
                  </template>
                  <span
                    v-else
                    class="inline-flex items-center gap-2 rounded-full bg-primary-subtle px-4 py-2 text-small font-medium text-primary"
                  >
                    <Icon name="play" size="14" />
                    {{ item.started ? t('portal.courses.continue') : t('courses.start') }}
                  </span>
                </div>
              </div>
            </article>
          </li>
        </ul>
        <EmptyState
          v-else
          icon="graduation-cap"
          :title="activeTab === 'completed' ? t('portal.courses.noCompleted') : t('courses.noAssignments')"
          class="mt-6"
        />
      </template>
    </div>
  </div>
</template>
