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

  <div class="min-h-screen bg-bg pb-12">
    <!-- Full Width Hero Banner -->
    <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800"></div>
      <div class="absolute inset-0 opacity-30 bg-[url('https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
      
      <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ t('courses.myLearning') }}</h1>
          <p class="mt-2 text-white/80 max-w-2xl text-body drop-shadow">{{ t('courses.catalog') }} - Explore and continue your learning journey.</p>
        </div>
        
        <div class="flex items-center gap-4 text-small bg-black/30 backdrop-blur-md px-4 py-2.5 rounded-lg border border-white/10">
          <label class="flex items-center gap-2 cursor-pointer text-white/90 hover:text-white transition-default">
            <input v-model="showCompleted" type="checkbox" class="h-4 w-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary/50" />
            {{ t('courses.showCompleted') }}
          </label>
        </div>
      </div>
    </div>

    <!-- White Tabs & Search Band -->
    <div class="bg-surface border-b border-border shadow-sm">
      <div class="mx-auto max-w-[1440px] px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2 sm:py-0">
        <Tabs v-model="activeTab" :tabs="tabs" class="-mb-px" />
        
        <div class="flex items-center gap-2 sm:py-3">
          <div class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-ink-faint focus-within:border-primary/50 focus-within:bg-surface focus-within:shadow-sm w-full sm:w-64 transition-default">
            <Icon name="search" size="16" />
            <input type="text" v-model="search" :placeholder="t('users.filters.search')" class="w-full bg-transparent text-small text-ink placeholder:text-ink-muted focus:outline-none" />
          </div>
        </div>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-8">
      <p v-if="errorMessage" class="mb-6 text-small text-danger">{{ errorMessage }}</p>

      <template v-if="loading">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Skeleton v-for="i in 8" :key="i" class="h-72 w-full rounded-xl" />
        </div>
      </template>

      <template v-else>

        <div v-if="filteredAssignments.length" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AppCard
            v-for="a in filteredAssignments"
            :key="a.id"
            padding="none"
            hover
            class="cursor-pointer overflow-hidden border border-border shadow-sm flex flex-col rounded-xl hover:shadow-md hover:-translate-y-1 transition-all duration-300"
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
        <section v-if="discoverCatalog.length" class="mt-16">
          <div class="flex items-center justify-between border-b border-border pb-4 mb-6">
            <h2 class="text-2xl font-bold text-ink">{{ t('courses.catalog') }}</h2>
          </div>
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AppCard
              v-for="course in discoverCatalog"
              :key="course.id"
              padding="none"
              hover
              class="cursor-pointer overflow-hidden border border-border shadow-sm rounded-xl hover:shadow-md hover:-translate-y-1 transition-all duration-300"
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
  </div>
</template>
