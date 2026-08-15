<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Tabs from '@/components/ui/Tabs.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const assignments = ref([])
const catalog = ref([])
const search = ref('')
const activeTab = ref('all')
const enrollingId = ref(null)
const progressByCourseId = ref({})

function courseProgress(courseId) {
  return progressByCourseId.value[courseId]?.completionPercent ?? 0
}

function badgeVariant(a) {
  if (a.isExpired) return 'danger'
  if (a.status === 'COMPLETED') return 'success'
  if (a.isOverdue) return 'warning'
  return 'primary'
}
function badgeLabel(a) {
  if (a.isExpired) return t('courses.badges.expired')
  if (a.status === 'COMPLETED') return t('courses.badges.completed')
  if (a.isOverdue) return t('courses.badges.overdue')
  return t('courses.badges.onTrack')
}

const tabs = computed(() => [
  { value: 'all', label: t('courses.tabs.all'), count: assignments.value.length },
  { value: 'required', label: t('courses.tabs.required'), count: assignments.value.filter((a) => a.mandatory).length },
  { value: 'inProgress', label: t('courses.tabs.inProgress'), count: assignments.value.filter((a) => a.status === 'ACTIVE' && !a.isExpired).length },
  { value: 'completed', label: t('courses.tabs.completed'), count: assignments.value.filter((a) => a.status === 'COMPLETED').length },
  { value: 'expired', label: t('courses.tabs.expired'), count: assignments.value.filter((a) => a.isExpired).length },
])

const filteredAssignments = computed(() => {
  let list = assignments.value
  if (activeTab.value === 'required') list = list.filter((a) => a.mandatory)
  else if (activeTab.value === 'inProgress') list = list.filter((a) => a.status === 'ACTIVE' && !a.isExpired)
  else if (activeTab.value === 'completed') list = list.filter((a) => a.status === 'COMPLETED')
  else if (activeTab.value === 'expired') list = list.filter((a) => a.isExpired)

  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter((a) => a.course?.title?.toLowerCase().includes(q))
  }
  return list
})

const featured = computed(() => {
  const active = assignments.value.filter((a) => a.status === 'ACTIVE')
  return [...active].sort((a, b) => new Date(a.deadline ?? 8640000000000000) - new Date(b.deadline ?? 8640000000000000))[0] ?? null
})

const discoverCatalog = computed(() => {
  const assignedIds = new Set(assignments.value.map((a) => a.courseId))
  return catalog.value.filter((c) => !assignedIds.has(c.id))
})

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [myAssignments, catalogResult] = await Promise.all([
      coursesApi.myAssignments(auth.user.id),
      coursesApi.list({}),
    ])

    const courses = await Promise.all(myAssignments.map((a) => coursesApi.getById(a.courseId)))
    assignments.value = myAssignments.map((a, i) => ({ ...a, course: courses[i] }))
    catalog.value = catalogResult.items

    const progressEntries = await Promise.all(
      myAssignments.map((a) => coursesApi.getMyProgress(a.courseId).then((p) => [a.courseId, p]))
    )
    progressByCourseId.value = Object.fromEntries(progressEntries)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function enroll(course) {
  enrollingId.value = course.id
  try {
    const assignment = await coursesApi.enroll(course.id)
    assignments.value = [...assignments.value, { ...assignment, course }]
    router.push(`/courses/${course.id}`)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    enrollingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-h1 text-ink">{{ t('courses.myLearning') }}</h1>
      </div>
      <div class="w-full max-w-xs">
        <AppInput v-model="search" icon="search" :placeholder="t('courses.searchPlaceholder')" />
      </div>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-if="loading">
      <Skeleton class="mt-6 h-48 w-full" />
      <div class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton v-for="i in 6" :key="i" class="h-64 w-full" />
      </div>
    </template>

    <template v-else>
      <!-- Featured -->
      <AppCard v-if="featured" padding="none" hover class="mt-6 cursor-pointer overflow-hidden" @click="router.push(`/courses/${featured.courseId}`)">
        <div class="flex flex-col sm:flex-row">
          <div
            class="flex h-40 shrink-0 items-center justify-center bg-primary sm:h-auto sm:w-72"
            :style="featured.course?.cover ? `background-image:url(${featured.course.cover});background-size:cover;background-position:center` : ''"
          >
            <Icon v-if="!featured.course?.cover" name="graduation-cap" size="34" class="text-primary-foreground/80" />
          </div>
          <div class="flex flex-1 flex-col justify-between p-6">
            <div>
              <p class="text-caption font-semibold uppercase tracking-widest text-primary">{{ t('courses.featured') }}</p>
              <h2 class="mt-1.5 text-h2 text-ink">{{ featured.course?.title }}</h2>
              <p v-if="featured.course?.description" class="mt-1.5 line-clamp-2 text-small text-ink-muted">{{ featured.course.description }}</p>
            </div>
            <div class="mt-4">
              <ProgressBar :value="courseProgress(featured.courseId)" />
              <AppButton class="mt-4" icon="arrow-right" icon-position="right">{{ t('courses.continue') }}</AppButton>
            </div>
          </div>
        </div>
      </AppCard>

      <!-- Tabs -->
      <div class="mt-8">
        <Tabs v-model="activeTab" :tabs="tabs" />
      </div>

      <div v-if="filteredAssignments.length" class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <AppCard
          v-for="a in filteredAssignments"
          :key="a.id"
          padding="none"
          hover
          class="flex cursor-pointer flex-col overflow-hidden"
          @click="router.push(`/courses/${a.courseId}`)"
        >
          <div
            class="flex h-32 items-center justify-center bg-surface-2 text-ink-faint"
            :style="a.course?.cover ? `background-image:url(${a.course.cover});background-size:cover;background-position:center` : ''"
          >
            <Icon v-if="!a.course?.cover" name="book-open" size="24" />
          </div>
          <div class="flex flex-1 flex-col p-4">
            <div class="flex items-center gap-1.5">
              <Badge :variant="a.mandatory ? 'primary' : 'neutral'" size="sm">{{ a.mandatory ? t('courses.mandatory') : t('courses.optional') }}</Badge>
              <Badge :variant="badgeVariant(a)" size="sm">{{ badgeLabel(a) }}</Badge>
            </div>
            <h3 class="mt-2.5 line-clamp-2 text-small font-semibold text-ink">{{ a.course?.title }}</h3>
            <p v-if="a.course?.description" class="mt-1 line-clamp-2 text-caption text-ink-faint">{{ a.course.description }}</p>
            <div class="mt-auto pt-3.5">
              <div class="mb-1.5 flex items-center justify-between text-caption text-ink-faint">
                <span>{{ courseProgress(a.courseId) }}%</span>
                <span v-if="a.deadline">{{ t('courses.deadline') }}: {{ new Date(a.deadline).toLocaleDateString(locale) }}</span>
              </div>
              <ProgressBar :value="a.status === 'COMPLETED' ? 100 : courseProgress(a.courseId)" size="sm" />
            </div>
          </div>
        </AppCard>
      </div>
      <EmptyState v-else icon="graduation-cap" :title="t('courses.noAssignments')" class="mt-6" />

      <!-- Discover more -->
      <section v-if="discoverCatalog.length" class="mt-12">
        <h2 class="mb-4 text-h3 text-ink">{{ t('courses.catalog') }}</h2>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AppCard
            v-for="course in discoverCatalog"
            :key="course.id"
            padding="none"
            hover
            class="cursor-pointer overflow-hidden"
            @click="router.push(`/courses/${course.id}`)"
          >
            <div
              class="flex h-32 items-center justify-center bg-surface-2 text-ink-faint"
              :style="course.cover ? `background-image:url(${course.cover});background-size:cover;background-position:center` : ''"
            >
              <Icon v-if="!course.cover" name="book-open" size="24" />
            </div>
            <div class="flex flex-col p-4">
              <h3 class="line-clamp-2 text-small font-semibold text-ink">{{ course.title }}</h3>
              <p v-if="course.description" class="mt-1 line-clamp-2 text-caption text-ink-faint">{{ course.description }}</p>
              <AppButton
                class="mt-3.5"
                size="sm"
                icon="plus"
                :loading="enrollingId === course.id"
                @click.stop="enroll(course)"
              >
                {{ t('courses.join') }}
              </AppButton>
            </div>
          </AppCard>
        </div>
      </section>
    </template>
  </div>
</template>
