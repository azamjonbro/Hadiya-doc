<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import BranchSelect from '@/components/ui/BranchSelect.vue'
import { usersApi } from '@/services/users'
import Badge from '@/components/ui/Badge.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import CourseDangerActions from '@/admin/components/CourseDangerActions.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const filters = reactive({
  search: '',
  status: '',
  branch: route.query.branch ?? '',
  categoryId: '',
  level: '',
  tag: '',
})

// Loaded once. Both lists are small and change rarely, and a filter bar that
// waits on two requests before it can be used is worse than one that fills in
// a moment later.
const categories = ref([])
const tags = ref([])
coursesApi
  .categories()
  .then((rows) => {
    categories.value = rows
  })
  .catch(() => {
    categories.value = []
  })
coursesApi
  .tags()
  .then((rows) => {
    tags.value = rows
  })
  .catch(() => {
    tags.value = []
  })

const categoryOptions = computed(() =>
  // The count is part of the label because a category with nothing in it
  // reads as a broken filter otherwise.
  categories.value.map((category) => ({ value: category.id, label: `${category.name} (${category.courseCount})` }))
)
const tagOptions = computed(() => tags.value.map((tag) => ({ value: tag, label: tag })))
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']

// Admins see every course regardless of branch (visibility scoping applies to
// employees only), so this is a plain facet: "show me what Toshkent runs".
const branchOptions = ref([])
usersApi
  .branches()
  .then((names) => {
    branchOptions.value = names
  })
  .catch(() => {
    branchOptions.value = []
  })

const hasActiveFilters = computed(() =>
  Boolean(filters.search || filters.status || filters.branch || filters.categoryId || filters.level || filters.tag)
)

function clearFilters() {
  Object.assign(filters, { search: '', status: '', branch: '', categoryId: '', level: '', tag: '' })
  loadFirstPage()
}

const PAGE_SIZE = 15

const items = ref([])
const loading = ref(false)
const errorMessage = ref('')
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)

// "17–31 of 48" — the range is derived from the page rather than from
// items.length so it stays right while a page is still loading.
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1))
const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, total.value))

function buildParams() {
  const params = { page: page.value, limit: PAGE_SIZE }
  if (filters.search) params.search = filters.search
  if (filters.status) params.status = filters.status
  if (filters.branch) params.branch = filters.branch
  if (filters.categoryId) params.categoryId = filters.categoryId
  if (filters.level) params.level = filters.level
  if (filters.tag) params.tag = filters.tag
  return params
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await coursesApi.list(buildParams())
    items.value = result.items
    total.value = result.total
    totalPages.value = result.totalPages
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

// Any filter change invalidates the current page number — staying on page 4
// of a result set that now has one page would show an empty screen.
function loadFirstPage() {
  page.value = 1
  return load()
}

async function goToPage(next) {
  page.value = next
  await load()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const statusBadge = { DRAFT: 'neutral', PUBLISHED: 'success', ARCHIVED: 'danger' }

// A delete changes `total`, so the page is re-fetched rather than spliced
// in place — otherwise the page count and the "17–31 of 48" range go stale.
// Stepping back first avoids landing on an empty last page after removing
// its only remaining row.
async function onCourseDeleted() {
  if (items.value.length === 1 && page.value > 1) page.value -= 1
  await load()
}

// Archiving only rewrites one row, so it's patched in place — unless a
// status filter is active, where the row may no longer belong on this page
// at all and the server has to decide.
function onCourseArchived(updated) {
  if (filters.status) {
    load()
    return
  }
  const index = items.value.findIndex((c) => c.id === updated.id)
  if (index !== -1) items.value[index] = updated
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-h1 text-ink">{{ t('courses.title') }}</h1>
      <AppButton v-if="auth.hasPermission('course:create')" icon="plus" @click="router.push('/bos/courses/new')">{{ t('courses.newCourse') }}</AppButton>
    </div>

    <!-- items-center: unlabelled controls, and the button is shorter than
         the fields — see the same note in UsersListView. -->
    <div class="mt-5 flex flex-wrap items-center gap-3">
      <div class="w-64">
        <AppInput v-model="filters.search" icon="search" :placeholder="t('courses.filters.search')" @keyup.enter="loadFirstPage" />
      </div>
      <div class="w-48">
        <AppSelect
          v-model="filters.status"
          :placeholder="t('courses.filters.allStatuses')"
          :options="[{ value: 'DRAFT', label: t('courses.status.draft') }, { value: 'PUBLISHED', label: t('courses.status.published') }, { value: 'ARCHIVED', label: t('courses.status.archived') }]"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div class="w-48">
        <BranchSelect
          v-model="filters.branch"
          :options="branchOptions"
          :placeholder="t('courses.filters.allBranches')"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div class="w-48">
        <AppSelect
          v-model="filters.categoryId"
          :placeholder="t('courses.filters.allCategories')"
          :options="categoryOptions"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div class="w-44">
        <AppSelect
          v-model="filters.level"
          :placeholder="t('courses.filters.allLevels')"
          :options="LEVELS.map((level) => ({ value: level, label: t(`courses.level.${level}`) }))"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div v-if="tagOptions.length" class="w-44">
        <AppSelect
          v-model="filters.tag"
          :placeholder="t('courses.filters.allTags')"
          :options="tagOptions"
          @update:model-value="loadFirstPage"
        />
      </div>
      <AppButton variant="outline" icon="search" @click="loadFirstPage">{{ t('courses.filters.apply') }}</AppButton>
      <AppButton v-if="hasActiveFilters" variant="ghost" icon="close" @click="clearFilters">
        {{ t('courses.filters.clear') }}
      </AppButton>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 6" :key="i" class="h-52 w-full" />
    </div>

    <div v-else-if="items.length" class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <AppCard
        v-for="course in items"
        :key="course.id"
        padding="none"
        hover
        class="group relative flex cursor-pointer flex-col overflow-hidden"
        @click="router.push(`/bos/courses/${course.id}`)"
      >
        <!-- Destructive actions stay hidden until the card is hovered or
             something inside it has focus, so the grid reads as a catalog
             rather than a row of delete buttons. Keyboard users get them via
             focus-within rather than never. -->
        <CourseDangerActions
          :course="course"
          layout="icons"
          class="absolute right-2 top-2 z-10 opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100"
          @archived="onCourseArchived"
          @deleted="onCourseDeleted"
        />
        <div
          class="flex h-32 items-center justify-center bg-surface-2 text-ink-faint"
          :style="course.cover ? `background-image:url(${course.cover});background-size:cover;background-position:center` : ''"
        >
          <Icon v-if="!course.cover" name="book-open" size="24" />
        </div>
        <div class="flex flex-1 flex-col p-4">
          <Badge :variant="statusBadge[course.status]" size="sm" class="self-start">{{ t(`courses.status.${course.status.toLowerCase()}`) }}</Badge>
          <h3 class="mt-2.5 line-clamp-2 text-small font-semibold text-ink">{{ course.title }}</h3>
          <p v-if="course.description" class="mt-1 line-clamp-2 text-caption text-ink-faint">{{ course.description }}</p>
          <div v-if="course.tags?.length" class="mt-2 flex flex-wrap gap-1">
            <span v-for="tag in course.tags.slice(0, 3)" :key="tag" class="rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink-muted">
              {{ tag }}
            </span>
          </div>
          <p class="mt-auto flex flex-wrap items-center gap-x-2 pt-3 text-caption text-ink-faint">
            <span>{{ t(`courses.level.${course.level ?? 'BEGINNER'}`) }}</span>
            <span v-if="course.estimatedMinutes">· {{ t('courses.minutes', { count: course.estimatedMinutes }) }}</span>
            <span>· {{ new Date(course.updatedAt).toLocaleDateString(locale) }}</span>
          </p>
        </div>
      </AppCard>
    </div>

    <EmptyState v-else icon="book-open" :title="t('courses.empty')" class="mt-6" />

    <!-- Kept mounted whenever there are results, even for a single page, so
         the count stays visible and the grid does not jump as pages change. -->
    <div v-if="total > 0" class="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p class="text-small text-ink-muted">
        {{ t('common.pagination.range', { from: rangeStart, to: rangeEnd, total }) }}
      </p>
      <Pagination v-if="totalPages > 1" :page="page" :total-pages="totalPages" @update:page="goToPage" />
    </div>
  </div>
</template>
