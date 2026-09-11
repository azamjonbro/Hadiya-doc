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
import { onClickOutside } from '@/composables/onClickOutside'

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
// The branch list is a user:read endpoint; an author without it keeps
// the other filters and skips the request rather than collecting a 403.
if (auth.hasPermission('user:read')) {
  usersApi
    .branches()
    .then((names) => {
      branchOptions.value = names
    })
    .catch(() => {
      branchOptions.value = []
    })
}

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

// Rasn 3: the Create menu — the content types the library can start.
// Each leads to the page that makes one; a type we have no page for is
// not offered.
const filtersOpen = ref(false)
const createOpen = ref(false)
const createRef = ref(null)
onClickOutside(createRef, () => (createOpen.value = false))
const createItems = computed(() =>
  [
    { key: 'course', icon: 'layers', tone: 'bg-sky-100 text-sky-600', labelKey: 'portal.courses.typeCourse', to: '/bos/courses/new', permission: 'course:create' },
    { key: 'path', icon: 'trending-up', tone: 'bg-violet-100 text-violet-600', labelKey: 'portal.courses.typePath', to: '/bos/paths', permission: 'path:manage' },
    { key: 'quiz', icon: 'check-circle', tone: 'bg-emerald-100 text-emerald-600', labelKey: 'questions.title', to: '/bos/question-banks', permission: 'quiz:configure' },
    { key: 'task', icon: 'pencil', tone: 'bg-amber-100 text-amber-600', labelKey: 'nav.tasks', to: '/bos/tasks', permission: 'task:create' },
    { key: 'scorm', icon: 'upload', tone: 'bg-teal-100 text-teal-600', labelKey: 'courses.import', to: '/bos/courses/new?import=scorm', permission: 'course:create' },
    { key: 'ai', icon: 'sparkles', tone: 'bg-rose-100 text-rose-600', labelKey: 'ai.title', to: '/bos/ai', permission: 'course:create' },
  ].filter((item) => auth.hasPermission(item.permission)),
)
function create(item) {
  createOpen.value = false
  router.push(item.to)
}

const selected = ref([])
const allSelected = computed(() => items.value.length > 0 && selected.value.length === items.value.length)
function toggleAll() {
  selected.value = allSelected.value ? [] : items.value.map((course) => course.id)
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <!-- Rasn 2: the library name, the collaborator avatars under it, and
         on the right "···", upload, "create with AI" and the green
         Create menu -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('admin.section.library') }}</h1>
        <p class="mt-1 text-[13px] text-ink-muted">{{ t('common.pagination.range', { from: rangeStart, to: rangeEnd, total }) }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-muted transition-default hover:bg-surface-hover hover:text-ink"
          :aria-label="t('common.filter')"
          :aria-expanded="filtersOpen"
          @click="filtersOpen = !filtersOpen"
        >
          <Icon name="filter" size="18" />
        </button>
        <button
          v-if="auth.hasPermission('course:create')"
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-muted transition-default hover:bg-surface-hover hover:text-ink"
          :title="t('courses.import')"
          :aria-label="t('courses.import')"
          @click="router.push('/bos/courses/new?import=scorm')"
        >
          <Icon name="upload" size="18" />
        </button>
        <!-- The AI course button carries the reference's gradient ring -->
        <span v-if="auth.hasPermission('course:create')" class="rounded-lg bg-gradient-to-r from-rose-500 via-purple-500 to-blue-500 p-[2px]">
          <button
            type="button"
            class="flex h-9 items-center gap-2 rounded-[6px] bg-surface px-4 text-[14px] font-medium text-ink transition-default hover:bg-surface-2"
            @click="router.push('/bos/ai')"
          >
            <Icon name="plus" size="16" />{{ t('ai.title') }}
          </button>
        </span>
        <div v-if="auth.hasPermission('course:create')" ref="createRef" class="relative">
          <AppButton icon="plus" :aria-expanded="createOpen" aria-haspopup="menu" @click="createOpen = !createOpen">{{ t('common.create') }}</AppButton>
          <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1" leave-active-class="transition-default" leave-to-class="opacity-0 -translate-y-1">
            <div v-if="createOpen" class="absolute right-0 z-20 mt-2 grid w-[380px] grid-cols-2 gap-1 rounded-xl bg-surface p-3 shadow-xl" role="menu">
              <button
                v-for="item in createItems"
                :key="item.key"
                type="button"
                role="menuitem"
                class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] text-ink transition-default hover:bg-surface-2"
                @click="create(item)"
              >
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md" :class="item.tone"><Icon :name="item.icon" size="18" /></span>
                {{ t(item.labelKey) }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Filters fold away behind the funnel: the reference's library has a
         search in the top bar and nothing above the table -->
    <div v-if="filtersOpen" class="mt-5 flex flex-wrap items-center gap-3">
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
        <BranchSelect v-model="filters.branch" :options="branchOptions" :placeholder="t('courses.filters.allBranches')" @update:model-value="loadFirstPage" />
      </div>
      <div class="w-48">
        <AppSelect v-model="filters.categoryId" :placeholder="t('courses.filters.allCategories')" :options="categoryOptions" @update:model-value="loadFirstPage" />
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
        <AppSelect v-model="filters.tag" :placeholder="t('courses.filters.allTags')" :options="tagOptions" @update:model-value="loadFirstPage" />
      </div>
      <AppButton variant="outline" icon="search" @click="loadFirstPage">{{ t('courses.filters.apply') }}</AppButton>
      <AppButton v-if="hasActiveFilters" variant="ghost" icon="close" @click="clearFilters">{{ t('courses.filters.clear') }}</AppButton>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 space-y-2">
      <Skeleton v-for="i in 6" :key="i" class="h-14 w-full rounded-lg" />
    </div>

    <!-- The table (rasn 2): checkbox, icon + name, type, assignments,
         author, added; 56px rows -->
    <div v-else-if="items.length" class="mt-4 overflow-x-auto">
      <table class="w-full min-w-[860px] text-[14px]">
        <thead>
          <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
            <th class="w-10 pl-3"><input type="checkbox" class="h-4 w-4 rounded border-border-strong" :checked="allSelected" :aria-label="t('common.all')" @change="toggleAll" /></th>
            <th class="pr-2 font-medium text-ink">{{ t('courses.columns.name') }} <Icon name="chevron-up" size="12" class="inline text-ink-faint" /></th>
            <th class="w-36 px-2 font-medium">{{ t('courses.columns.type') }}</th>
            <th class="w-40 px-2 font-medium">{{ t('courses.columns.assignments') }}</th>
            <th class="w-48 px-2 font-medium">{{ t('courses.columns.author') }}</th>
            <th class="w-44 px-2 font-medium">{{ t('courses.columns.added') }}</th>
            <th class="w-24 pr-3 text-right"><Icon name="settings" size="16" class="inline text-ink-muted" /></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="course in items"
            :key="course.id"
            class="group h-14 cursor-pointer border-b border-border transition-default last:border-b-0 hover:bg-surface-2"
            @click="router.push(`/bos/courses/${course.id}`)"
          >
            <td class="pl-3" @click.stop><input v-model="selected" type="checkbox" :value="course.id" class="h-4 w-4 rounded border-border-strong" /></td>
            <td class="pr-2">
              <span class="flex items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"><Icon name="layers" size="18" /></span>
                <span class="min-w-0">
                  <span class="block truncate text-ink">{{ course.title }}</span>
                  <Badge v-if="course.status !== 'PUBLISHED'" :variant="statusBadge[course.status]" size="sm">{{ t(`courses.status.${course.status.toLowerCase()}`) }}</Badge>
                </span>
              </span>
            </td>
            <td class="px-2 text-ink">{{ t('portal.courses.typeCourse') }}</td>
            <td class="px-2 text-ink">{{ course.assignmentCount ? t('portal.courses.assigned') : '—' }}</td>
            <td class="px-2 text-ink">{{ course.authorName || '—' }}</td>
            <td class="px-2 text-ink-muted">{{ new Date(course.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) }}</td>
            <td class="pr-3 text-right" @click.stop>
              <CourseDangerActions
                :course="course"
                layout="icons"
                class="justify-end opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100"
                @archived="onCourseArchived"
                @deleted="onCourseDeleted"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EmptyState v-else icon="book-open" :title="t('courses.empty')" class="mt-6" />

    <div v-if="totalPages > 1" class="mt-6 flex justify-end">
      <Pagination :page="page" :total-pages="totalPages" @update:page="goToPage" />
    </div>
  </div>
</template>
