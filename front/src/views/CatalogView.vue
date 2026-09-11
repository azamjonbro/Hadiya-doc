<script setup>
/**
 * The course catalog (docs/v4/06-learner-portal-reference.md §2).
 *
 * The reference shows categories first — a two-column grid of cards with
 * a picture and "N courses" — and the courses only once a category is
 * chosen. That is the right order for a catalog of two hundred courses
 * and the wrong one for a catalog of five, so a category with nothing
 * behind it is not shown, and courses without a category get a card of
 * their own. `?category=<id>` keeps the chosen category in the URL, so
 * the back button and a shared link both land on the same list.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import PortalHero from '@/components/portal/PortalHero.vue'
import PortalBar from '@/components/portal/PortalBar.vue'
import SearchField from '@/components/portal/SearchField.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const categories = ref([])
const courses = ref([])
const assignedIds = ref(new Set())
const search = ref('')
const enrollingId = ref(null)

const UNCATEGORIZED = 'none'
const selectedCategory = computed(() => (typeof route.query.category === 'string' ? route.query.category : ''))

const grouped = computed(() => {
  const byCategory = new Map()
  for (const course of courses.value) {
    const key = course.categoryId ?? UNCATEGORIZED
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key).push(course)
  }
  const cards = categories.value
    .filter((c) => byCategory.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, description: c.description, color: c.color, count: byCategory.get(c.id).length, cover: byCategory.get(c.id).find((x) => x.cover)?.cover ?? '' }))
  if (byCategory.has(UNCATEGORIZED)) {
    const list = byCategory.get(UNCATEGORIZED)
    cards.push({ id: UNCATEGORIZED, name: t('portal.catalog.uncategorized'), description: '', color: '#64748b', count: list.length, cover: list.find((x) => x.cover)?.cover ?? '' })
  }
  return cards
})

const currentCategory = computed(() => grouped.value.find((c) => c.id === selectedCategory.value) ?? null)

const visibleCourses = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = courses.value
  if (selectedCategory.value) {
    list = list.filter((c) => (c.categoryId ?? UNCATEGORIZED) === selectedCategory.value)
  }
  if (q) list = list.filter((c) => c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
  return list
})

// Typing a search skips the category step: the person already knows what
// they want, and a grid of folders in the way is a step they did not ask for.
const showCategories = computed(() => !selectedCategory.value && !search.value.trim())

function openCategory(id) {
  router.push({ query: { ...route.query, category: id } })
}
function clearCategory() {
  const query = { ...route.query }
  delete query.category
  router.push({ query })
}

async function enroll(course) {
  enrollingId.value = course.id
  try {
    await coursesApi.enroll(course.id)
    assignedIds.value = new Set([...assignedIds.value, course.id])
    router.push(`/courses/${course.id}`)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    enrollingId.value = null
  }
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [cats, list, mine] = await Promise.all([
      coursesApi.categories().catch(() => []),
      coursesApi.list({ limit: 100 }),
      coursesApi.myAssignments(auth.user.id).catch(() => []),
    ])
    categories.value = cats
    courses.value = list.items ?? list
    assignedIds.value = new Set(mine.map((a) => a.courseId))
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

watch(() => route.query.category, () => window.scrollTo({ top: 0 }))
onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-bg pb-12">
    <PortalHero :title="t('portal.nav.catalog')" image="catalog" />

    <PortalBar>
      <button v-if="currentCategory" type="button" class="flex items-center gap-1.5 text-small text-ink-muted transition-default hover:text-ink" @click="clearCategory">
        <Icon name="chevron-left" size="16" />
        {{ t('portal.catalog.allCategories') }}
      </button>
      <p v-else class="text-small text-ink">{{ t('portal.catalog.intro') }}</p>
      <SearchField v-model="search" class="ml-auto" />
    </PortalBar>

    <div class="mx-auto w-full max-w-[1140px] px-4 pt-6">
      <p v-if="errorMessage" class="mb-6 text-small text-danger">{{ errorMessage }}</p>

      <div v-if="loading" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton v-for="i in 4" :key="i" class="h-[120px] w-full rounded-lg" />
      </div>

      <!-- Categories -->
      <template v-else-if="showCategories">
        <div v-if="grouped.length" class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            v-for="cat in grouped"
            :key="cat.id"
            type="button"
            class="flex flex-col gap-4 rounded-lg bg-surface p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-default hover:shadow-md sm:flex-row sm:gap-5"
            @click="openCategory(cat.id)"
          >
            <div class="relative h-[140px] w-full shrink-0 overflow-hidden rounded-md bg-surface-2 sm:h-[92px] sm:w-[164px]">
              <img v-if="cat.cover" :src="cat.cover" alt="" class="h-full w-full object-cover" />
              <div v-else class="flex h-full w-full items-center justify-center text-white/80" :style="`background:${cat.color}`">
                <Icon name="book-open" size="32" />
              </div>
              <span class="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">
                {{ t('portal.catalog.courseCount', { count: cat.count }) }}
              </span>
            </div>
            <div class="min-w-0 py-1">
              <h2 class="text-[16px] font-semibold text-ink">{{ cat.name }}</h2>
              <p v-if="cat.description" class="mt-1.5 line-clamp-2 text-caption text-ink-muted">{{ cat.description }}</p>
            </div>
          </button>
        </div>
        <EmptyState v-else icon="book-open" :title="t('portal.catalog.empty')" class="mt-6" />
      </template>

      <!-- Courses in a category (or a search across all of them) -->
      <template v-else>
        <h2 v-if="currentCategory" class="mb-4 text-[20px] font-semibold text-ink">{{ currentCategory.name }}</h2>
        <div v-if="visibleCourses.length" class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <article
            v-for="course in visibleCourses"
            :key="course.id"
            class="flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-default hover:shadow-md sm:flex-row sm:gap-5"
          >
            <router-link :to="`/courses/${course.id}`" class="relative h-[140px] w-full shrink-0 overflow-hidden rounded-md bg-surface-2 sm:h-[92px] sm:w-[164px]">
              <img v-if="course.cover" :src="course.cover" alt="" class="h-full w-full object-cover" />
              <div v-else class="flex h-full w-full items-center justify-center bg-slate-700 text-white/70">
                <Icon name="book-open" size="28" />
              </div>
            </router-link>
            <div class="flex min-w-0 flex-1 flex-col py-1">
              <router-link :to="`/courses/${course.id}`" class="text-[16px] font-semibold text-ink hover:text-primary">{{ course.title }}</router-link>
              <p v-if="course.description" class="mt-1.5 line-clamp-2 text-caption text-ink-muted">{{ course.description }}</p>
              <div class="mt-auto flex items-center justify-between gap-3 pt-3">
                <span v-if="course.estimatedMinutes" class="flex items-center gap-1 text-caption text-ink-faint">
                  <Icon name="clock" size="12" />{{ t('courses.minutes', { count: course.estimatedMinutes }) }}
                </span>
                <span v-else />
                <span v-if="assignedIds.has(course.id)" class="text-caption font-medium text-success">{{ t('portal.catalog.enrolled') }}</span>
                <AppButton v-else size="sm" :loading="enrollingId === course.id" @click="enroll(course)">{{ t('portal.catalog.enroll') }}</AppButton>
              </div>
            </div>
          </article>
        </div>
        <EmptyState v-else icon="search" :title="t('portal.catalog.empty')" class="mt-6" />
      </template>
    </div>
  </div>
</template>
