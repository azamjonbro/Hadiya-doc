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
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const assignments = ref([])
const catalog = ref([])
const search = ref('')
const activeTab = ref('required')
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
  { value: 'required', label: t('courses.tabs.required'), count: assignments.value.filter((a) => a.mandatory).length },
  { value: 'all', label: t('courses.tabs.catalog'), count: assignments.value.length },
  { value: 'completed', label: t('courses.tabs.completed'), count: assignments.value.filter((a) => a.status === 'COMPLETED').length },
  { value: 'expired', label: t('courses.tabs.expired'), count: assignments.value.filter((a) => a.isExpired).length },
])

const filteredAssignments = computed(() => {
  let list = assignments.value
  if (activeTab.value === 'required') list = list.filter((a) => a.mandatory)
  else if (activeTab.value === 'completed') list = list.filter((a) => a.status === 'COMPLETED')
  else if (activeTab.value === 'expired') list = list.filter((a) => a.isExpired)

  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter((a) => a.course?.title?.toLowerCase().includes(q))
  }
  return list
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
    errorMessage.value = apiErrorText(error)
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
    errorMessage.value = apiErrorText(error)
  } finally {
    enrollingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <div class="flex items-center justify-between border-b border-border pb-4">
      <h2 class="text-h2 text-ink">{{ t('courses.myLearning') }}</h2>
      <div class="flex items-center gap-4 text-small">
        <label class="flex items-center gap-2 cursor-pointer text-ink-muted hover:text-ink transition-default">
          <input v-model="showCompleted" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary/30" />
          {{ t('courses.showCompleted') }}
        </label>
      </div>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-if="loading">
      <div class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton v-for="i in 6" :key="i" class="h-64 w-full" />
      </div>
    </template>

    <template v-else>
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
          class="cursor-pointer overflow-hidden border border-border shadow-sm flex flex-col"
          @click="router.push(`/courses/${a.courseId}`)"
        >
          <div
            class="flex h-36 shrink-0 items-center justify-center bg-surface-2 text-ink-faint"
            :style="a.course?.cover ? `background-image:url(${a.course.cover});background-size:cover;background-position:center` : ''"
          >
            <Icon v-if="!a.course?.cover" name="book-open" size="24" />
          </div>
          <div class="flex flex-1 flex-col p-5">
            <div class="flex items-center gap-2 mb-3">
              <Badge :variant="a.mandatory ? 'primary' : 'neutral'" size="sm">{{ a.mandatory ? t('courses.mandatory') : t('courses.optional') }}</Badge>
              <Badge :variant="badgeVariant(a)" size="sm">{{ badgeLabel(a) }}</Badge>
            </div>
            <h3 class="line-clamp-2 text-small font-semibold text-ink leading-snug">{{ a.course?.title }}</h3>
            <p v-if="a.course?.description" class="mt-2 line-clamp-2 text-caption text-ink-muted leading-relaxed">{{ a.course.description }}</p>
            <div class="mt-auto pt-4 border-t border-border border-dashed">
              <div class="mb-2 flex items-center justify-between text-caption font-medium text-ink-muted">
                <span>{{ courseProgress(a.courseId) }}%</span>
                <span v-if="a.deadline" class="flex items-center gap-1"><Icon name="clock" size="12"/>{{ new Date(a.deadline).toLocaleDateString(locale) }}</span>
              </div>
              <ProgressBar :value="a.status === 'COMPLETED' ? 100 : courseProgress(a.courseId)" size="sm" />
            </div>
          </div>
        </AppCard>
      </div>
      <EmptyState v-else icon="graduation-cap" :title="t('courses.noAssignments')" class="mt-6" />

      <!-- Discover more -->
      <section v-if="discoverCatalog.length" class="mt-12">
        <div class="flex items-center justify-between border-b border-border pb-4">
          <h2 class="text-h2 text-ink">{{ t('courses.catalog') }}</h2>
        </div>
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
