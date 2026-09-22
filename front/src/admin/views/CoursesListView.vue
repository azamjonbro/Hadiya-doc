<script setup>
import { computed, reactive, ref, watch } from 'vue'
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
import ProjectManageModal from '@/admin/components/projects/ProjectManageModal.vue'
import AddMembersModal from '@/admin/components/projects/AddMembersModal.vue'
import FileCourseModal from '@/admin/components/projects/FileCourseModal.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { projectsApi } from '@/services/projects'
import { useProjectsStore } from '@/stores/projects'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { onClickOutside } from '@/composables/onClickOutside'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const projectsStore = useProjectsStore()

// One view, two pages. At /bos/courses this is the whole library; at
// /bos/projects/:id it is one folder of it (rasm 4): the project's name and
// people in the header, only its courses in the table, and every "create"
// filing what it makes into the folder. The table is the same either way,
// which is why this is a mode and not a second view.
const projectId = computed(() => (route.name === 'admin-project' ? String(route.params.id) : ''))
const project = ref(null)
const projectError = ref('')
const manageOpen = ref(false)
const membersOpen = ref(false)
const fileOpen = ref(false)
const projectMenuOpen = ref(false)
const projectMenuRef = ref(null)
onClickOutside(projectMenuRef, () => (projectMenuOpen.value = false))
const canManageProject = computed(() => project.value?.access === 'OWNER')
const canFile = computed(() => project.value?.access === 'OWNER' || project.value?.access === 'EDIT')
// The header's avatar row: the owner, then members, capped like the
// reference caps it.
const projectPeople = computed(() => {
  if (!project.value) return []
  return [project.value.owner, ...(project.value.members ?? [])].filter(Boolean).slice(0, 6)
})

async function loadProject() {
  project.value = null
  projectError.value = ''
  if (!projectId.value) return
  try {
    project.value = await projectsApi.getById(projectId.value)
    projectsStore.upsert(project.value)
    // Made from the sidebar's "+": land in the dialog with the name selected.
    if (route.query.manage === '1') {
      manageOpen.value = true
      router.replace({ path: route.path })
    }
  } catch (error) {
    projectError.value = apiErrorText(error)
  }
}
function onProjectUpdated(updated) {
  project.value = updated
  projectsStore.upsert(updated)
}
function onProjectDeleted(id) {
  projectsStore.forget(id)
  router.replace('/bos/courses')
}
async function onCourseFiled(course) {
  fileOpen.value = false
  projectsStore.bump(projectId.value, 1)
  if (project.value) project.value.courseCount = (project.value.courseCount ?? 0) + 1
  toast.success(t('projects.file.done', { title: course.title }))
  await loadFirstPage()
}
// Filing is by project, so the "new course" links carry the folder along
// and the builder files what it makes.
const withProject = (path) => {
  if (!projectId.value) return path
  const joiner = path.includes('?') ? '&' : '?'
  return `${path}${joiner}project=${projectId.value}`
}

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
  if (projectId.value) params.projectId = projectId.value
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
    { key: 'course', icon: 'layers', tone: 'bg-sky-100 text-sky-600', labelKey: 'portal.courses.typeCourse', to: withProject('/bos/courses/new'), permission: 'course:create' },
    // Inside a project: bring in a course that already exists (rasm 4's
    // "load or drag materials here"). Absent from the whole library, where
    // everything already is.
    ...(projectId.value
      ? [{ key: 'file', icon: 'download', tone: 'bg-lime-100 text-lime-700', labelKey: 'projects.file.action', action: () => (fileOpen.value = true), permission: 'course:update' }]
      : []),
    { key: 'path', icon: 'trending-up', tone: 'bg-violet-100 text-violet-600', labelKey: 'portal.courses.typePath', to: '/bos/paths', permission: 'path:manage' },
    { key: 'quiz', icon: 'check-circle', tone: 'bg-emerald-100 text-emerald-600', labelKey: 'questions.title', to: '/bos/question-banks', permission: 'quiz:configure' },
    { key: 'task', icon: 'pencil', tone: 'bg-amber-100 text-amber-600', labelKey: 'nav.tasks', to: '/bos/tasks', permission: 'task:create' },
    { key: 'scorm', icon: 'upload', tone: 'bg-teal-100 text-teal-600', labelKey: 'courses.import', to: withProject('/bos/courses/new?import=scorm'), permission: 'course:create' },
    { key: 'ai', icon: 'sparkles', tone: 'bg-rose-100 text-rose-600', labelKey: 'ai.title', to: '/bos/ai', permission: 'course:create' },
  ].filter((item) => auth.hasPermission(item.permission)),
)
function create(item) {
  createOpen.value = false
  if (item.action) item.action()
  else router.push(item.to)
}
// Authoring inside a folder needs write access to it; a VIEW member sees
// the courses and no way to add to them.
const canCreate = computed(() => auth.hasPermission('course:create') && (!projectId.value || canFile.value))

const selected = ref([])
const allSelected = computed(() => items.value.length > 0 && selected.value.length === items.value.length)
function toggleAll() {
  selected.value = allSelected.value ? [] : items.value.map((course) => course.id)
}

// The same component serves both routes, so moving from one project to
// another (or back to the library) is a param change, not a remount.
watch(
  projectId,
  async () => {
    selected.value = []
    filtersOpen.value = false
    await Promise.all([loadProject(), loadFirstPage()])
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <!-- Rasn 2: the library name, the collaborator avatars under it, and
         on the right "···", upload, "create with AI" and the green
         Create menu -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div v-if="projectId" class="min-w-0">
        <h1 class="truncate text-[24px] font-semibold text-ink">{{ project?.name ?? '…' }}</h1>
        <!-- Rasn 4: who works in the folder — the owner's avatar, the
             members', a "+" that adds more and "···" for the rest -->
        <div v-if="project" class="mt-2 flex items-center gap-1.5">
          <Tooltip v-for="person in projectPeople" :key="person.id" :text="person.fullName" position="bottom">
            <Avatar :name="person.fullName" :src="person.avatar" size="sm" />
          </Tooltip>
          <span v-if="project.memberCount + 1 > projectPeople.length" class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[12px] text-ink-muted">
            +{{ project.memberCount + 1 - projectPeople.length }}
          </span>
          <Tooltip v-if="canManageProject" :text="t('projects.members.addTitle')" position="bottom">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-muted transition-default hover:bg-surface-hover hover:text-ink"
              :aria-label="t('projects.members.addTitle')"
              @click="membersOpen = true"
            >
              <Icon name="plus" size="16" />
            </button>
          </Tooltip>
          <div ref="projectMenuRef" class="relative">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
              :aria-label="t('projects.manage.title')"
              :aria-expanded="projectMenuOpen"
              aria-haspopup="menu"
              @click="projectMenuOpen = !projectMenuOpen"
            >
              <Icon name="more-horizontal" size="18" />
            </button>
            <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1" leave-active-class="transition-default" leave-to-class="opacity-0 -translate-y-1">
              <div v-if="projectMenuOpen" class="absolute left-0 z-20 mt-1 w-56 rounded-xl bg-surface p-1.5 shadow-xl" role="menu">
                <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] text-ink transition-default hover:bg-surface-2" @click="projectMenuOpen = false; manageOpen = true">
                  <Icon name="settings" size="16" class="text-ink-muted" />{{ t('projects.manage.title') }}
                </button>
                <router-link role="menuitem" to="/bos/courses" class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] text-ink transition-default hover:bg-surface-2" @click="projectMenuOpen = false">
                  <Icon name="book-open" size="16" class="text-ink-muted" />{{ t('admin.section.allMaterials') }}
                </router-link>
              </div>
            </Transition>
          </div>
        </div>
        <p v-else-if="projectError" class="mt-1 text-[13px] text-danger">{{ projectError }}</p>
      </div>
      <div v-else>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('admin.section.allMaterials') }}</h1>
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
          v-if="canCreate"
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-muted transition-default hover:bg-surface-hover hover:text-ink"
          :title="t('courses.import')"
          :aria-label="t('courses.import')"
          @click="router.push(withProject('/bos/courses/new?import=scorm'))"
        >
          <Icon name="upload" size="18" />
        </button>
        <!-- The AI course button carries the reference's gradient ring -->
        <span v-if="canCreate" class="rounded-lg bg-gradient-to-r from-rose-500 via-purple-500 to-blue-500 p-[2px]">
          <button
            type="button"
            class="flex h-9 items-center gap-2 rounded-[6px] bg-surface px-4 text-[14px] font-medium text-ink transition-default hover:bg-surface-2"
            @click="router.push('/bos/ai')"
          >
            <Icon name="plus" size="16" />{{ t('ai.title') }}
          </button>
        </span>
        <div v-if="canCreate" ref="createRef" class="relative">
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

    <!-- Rasn 4: an empty folder asks for materials and names the formats -->
    <div v-else-if="projectId" class="mt-6 flex flex-col items-center px-6 py-14 text-center">
      <div class="relative flex h-40 w-40 items-center justify-center rounded-full bg-surface-2">
        <Icon name="file-text" size="56" class="text-ink-faint" />
        <span class="absolute bottom-5 right-4 h-12 w-2 rotate-45 rounded-full bg-primary" aria-hidden="true"></span>
      </div>
      <h2 class="mt-7 text-[20px] font-medium text-ink">{{ t('projects.empty.title') }}</h2>
      <p class="mt-2 text-[15px] text-ink-muted">
        <template v-if="canCreate">
          <button type="button" class="text-ink underline decoration-ink-faint underline-offset-4 hover:decoration-ink" @click="router.push(withProject('/bos/courses/new'))">{{ t('projects.empty.create') }}</button>,
          <button type="button" class="text-ink underline decoration-ink-faint underline-offset-4 hover:decoration-ink" @click="fileOpen = true">{{ t('projects.empty.file') }}</button>
          {{ t('projects.empty.or') }}
          <button type="button" class="text-ink underline decoration-ink-faint underline-offset-4 hover:decoration-ink" @click="router.push(withProject('/bos/courses/new?import=scorm'))">{{ t('projects.empty.upload') }}</button>
        </template>
        <template v-else>{{ t('projects.empty.viewOnly') }}</template>
      </p>
      <p class="mt-16 text-[13px] text-ink-faint">{{ t('projects.empty.formats') }}</p>
    </div>
    <EmptyState v-else icon="book-open" :title="t('courses.empty')" class="mt-6" />

    <template v-if="project">
      <ProjectManageModal v-model="manageOpen" :project="project" @updated="onProjectUpdated" @deleted="onProjectDeleted" />
      <AddMembersModal v-model="membersOpen" :project="project" @added="onProjectUpdated" />
      <FileCourseModal v-model="fileOpen" :project="project" @filed="onCourseFiled" />
    </template>

    <div v-if="totalPages > 1" class="mt-6 flex justify-end">
      <Pagination :page="page" :total-pages="totalPages" @update:page="goToPage" />
    </div>
  </div>
</template>
