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

  <div class="min-h-screen bg-bg pb-12">
    <!-- Premium Full Width Hero Banner -->
    <div class="relative w-full h-[320px] flex items-center overflow-hidden">
      <!-- Background Image with zoom animation -->
      <div class="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center animate-[pulse_10s_ease-in-out_infinite] scale-105"></div>
      
      <!-- Glassmorphic Gradient Overlays -->
      <div class="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent"></div>
      <div class="absolute inset-0 backdrop-blur-[2px]"></div>
      
      <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8 mt-8">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white text-sm font-medium mb-4 shadow-sm">
          <Icon name="sparkles" size="14" class="text-yellow-300" />
          {{ t('courses.tabs.catalog') }}
        </div>
        <h1 class="text-5xl lg:text-6xl font-black text-white leading-tight drop-shadow-lg tracking-tight">{{ t('courses.myLearning') }}</h1>
      </div>
    </div>

    <!-- Glassmorphic Tabs & Search Band -->
    <div class="relative z-20 mx-auto max-w-[1440px] px-6 lg:px-8 -mt-10 mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        <div class="flex items-center">
          <Tabs v-model="activeTab" :tabs="tabs" variant="pill" class="bg-surface-2/50 rounded-xl p-1" />
        </div>
        
        <div class="flex items-center w-full sm:w-72 relative group">
          <div class="absolute inset-0 bg-primary/5 rounded-xl blur-md group-focus-within:bg-primary/20 transition-all duration-300"></div>
          <div class="relative flex flex-1 items-center gap-2 rounded-xl border border-border/50 bg-surface/50 backdrop-blur-md px-4 py-2.5 text-ink-faint focus-within:border-primary focus-within:shadow-[0_0_0_2px_rgba(var(--color-primary),0.2)] transition-all duration-300">
            <Icon name="search" size="18" class="text-ink-muted group-focus-within:text-primary transition-colors" />
            <input type="text" v-model="search" :placeholder="t('users.filters.search')" class="w-full bg-transparent text-small text-ink placeholder:text-ink-muted focus:outline-none" />
          </div>
        </div>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-2">
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
            class="group cursor-pointer overflow-hidden border border-border/50 bg-surface shadow-sm rounded-2xl hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col relative"
            @click="router.push(`/courses/${a.courseId}`)"
          >
            <!-- Glowing background effect on hover -->
            <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div
              class="relative flex h-44 shrink-0 items-center justify-center text-ink-faint overflow-hidden"
            >
              <!-- Cover image with zoom effect -->
              <div class="absolute inset-0 bg-surface-2 transition-transform duration-700 group-hover:scale-105"
                   :style="a.course?.cover ? `background-image:url(${a.course.cover});background-size:cover;background-position:center` : ''">
              </div>
              <Icon v-if="!a.course?.cover" name="book-open" size="32" class="relative z-10 drop-shadow-sm transition-transform duration-500 group-hover:scale-110" />
              <!-- Bottom gradient overlay for text legibility -->
              <div class="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 to-transparent"></div>
              
              <!-- Badges positioned over the image -->
              <div class="absolute top-3 left-3 flex flex-wrap gap-1.5 z-20">
                <Badge :variant="a.mandatory ? 'primary' : 'neutral'" size="sm" class="shadow-sm backdrop-blur-md bg-white/95 text-black border-none font-bold">{{ a.mandatory ? t('courses.mandatory') : t('courses.optional') }}</Badge>
                <Badge :variant="badgeVariant(a)" size="sm" class="shadow-sm font-bold">{{ badgeLabel(a) }}</Badge>
              </div>
            </div>
            
            <div class="relative flex flex-1 flex-col p-5 z-10">
              <h3 class="line-clamp-2 text-base font-bold text-ink leading-tight group-hover:text-primary transition-colors duration-300">{{ a.course?.title }}</h3>
              <p v-if="a.course?.description" class="mt-2.5 line-clamp-2 text-small text-ink-muted leading-relaxed">{{ a.course.description }}</p>
              
              <div class="mt-auto pt-6">
                <div class="mb-2.5 flex items-center justify-between text-small font-semibold text-ink-muted">
                  <span :class="courseProgress(a.courseId) === 100 ? 'text-success' : 'text-primary'">{{ courseProgress(a.courseId) }}% Complete</span>
                  <span v-if="a.deadline" class="flex items-center gap-1.5 text-caption text-ink-faint bg-surface-2 px-2.5 py-1 rounded-md border border-border/50 shadow-sm"><Icon name="clock" size="12"/>{{ new Date(a.deadline).toLocaleDateString(locale) }}</span>
                </div>
                <div class="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden border border-border/30">
                  <div class="h-full rounded-full transition-all duration-1000 ease-out" 
                       :class="a.status === 'COMPLETED' ? 'bg-success shadow-[0_0_10px_rgba(var(--color-success),0.5)]' : 'bg-primary shadow-[0_0_10px_rgba(var(--color-primary),0.5)]'" 
                       :style="`width: ${a.status === 'COMPLETED' ? 100 : courseProgress(a.courseId)}%`">
                  </div>
                </div>
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
              class="group cursor-pointer overflow-hidden border border-border/50 bg-surface shadow-sm rounded-2xl hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col relative"
              @click="router.push(`/courses/${course.id}`)"
            >
            <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div
              class="relative flex h-40 items-center justify-center text-ink-faint overflow-hidden"
            >
              <!-- Cover image with zoom effect -->
              <div class="absolute inset-0 bg-surface-2 transition-transform duration-700 group-hover:scale-105"
                   :style="course.cover ? `background-image:url(${course.cover});background-size:cover;background-position:center` : ''">
              </div>
              <Icon v-if="!course.cover" name="book-open" size="32" class="relative z-10 drop-shadow-sm transition-transform duration-500 group-hover:scale-110" />
              <!-- Bottom gradient overlay -->
              <div class="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
            </div>
            
            <div class="relative flex flex-col p-5 z-20 flex-1">
              <h3 class="line-clamp-2 text-base font-bold text-ink group-hover:text-primary transition-colors duration-300">{{ course.title }}</h3>
              <p v-if="course.description" class="mt-2 line-clamp-2 text-small text-ink-muted leading-relaxed">{{ course.description }}</p>
              
              <div class="mt-auto pt-5">
                <AppButton
                  class="w-full shadow-sm hover:shadow-md transition-shadow group-hover:bg-primary-hover"
                  size="sm"
                  icon="plus"
                  :loading="enrollingId === course.id"
                  @click.stop="enroll(course)"
                >
                  {{ t('courses.join') }}
                </AppButton>
              </div>
            </div>
          </AppCard>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
