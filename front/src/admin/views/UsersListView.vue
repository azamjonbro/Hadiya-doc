<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { useRoute, useRouter } from 'vue-router'
import { ROLES, normalizeJshshir, normalizePassportSeries } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { useOrgDirectory } from '@/composables/useOrgDirectory'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import BranchSelect from '@/components/ui/BranchSelect.vue'
import EmployeeFormFields from '@/admin/components/employee/EmployeeFormFields.vue'
import GeneratedPasswordField from '@/components/ui/GeneratedPasswordField.vue'
import Modal from '@/components/ui/Modal.vue'
import FaceEnrollmentWizard from '@/components/face/FaceEnrollmentWizard.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const confirm = useConfirm()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()

// Roles, job titles, departments, subdivisions and countries all come from the
// server rather than from a hard-coded list: they are rows an admin can add
// from the employee form, and the filters here have to offer the same set the
// form just wrote to. Filtering is an exact match, so a free-text box turned
// any typo (or "manage" for "management") into an empty result with no hint
// as to why.
const directory = useOrgDirectory()
const { ORG_LIST_TYPES } = directory
const branchOptions = ref([])

const EMPTY_FILTERS = { search: '', role: '', branch: '', department: '', subdivision: '', country: '', status: '' }
const filters = reactive({ ...EMPTY_FILTERS, branch: route.query.branch ?? '' })

const hasActiveFilters = computed(() => Object.keys(EMPTY_FILTERS).some((key) => filters[key]))

function clearFilters() {
  Object.assign(filters, EMPTY_FILTERS)
  loadFirstPage()
}

// Three answers to "who works here", not two: archived is someone who left,
// which is a different thing from an account switched off while the person is
// still on the payroll.
const statusOptions = computed(() => [
  { value: 'working', label: t('users.filters.working') },
  { value: 'archived', label: t('users.filters.archived') },
  { value: 'active', label: t('users.filters.active') },
  { value: 'inactive', label: t('users.filters.inactive') },
])
const PAGE_SIZE = 15

const items = ref([])
const loading = ref(false)
const errorMessage = ref('')
const selected = ref(new Set())
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)

// "17–31 of 48" — derived from the page rather than from items.length so it
// stays right while a page is still loading.
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1))
const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, total.value))

const showCreateModal = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const BLANK_USER = {
  firstName: '',
  lastName: '',
  jshshir: '',
  passportSeries: '',
  email: '',
  phone: '',
  roleName: ROLES.EMPLOYEE,
  branch: '',
  department: '',
  subdivision: '',
  position: '',
  country: '',
  address: '',
  gender: '',
  birthDate: '',
  hireDate: '',
  terminationDate: '',
  password: '',
  isActive: true,
  courseIds: [],
}
const createForm = reactive({ ...BLANK_USER })
// Raised by the shared field block: identity fields that are filled in but
// malformed. Submitting anyway would only earn a 400.
const fieldsValid = ref(true)
const assignableCourses = ref([])

// { id, fullName } of a just-created user, offered the optional face
// enrollment step — see onCreateSubmit.
const pendingFaceEnrollUser = ref(null)

const progressByUserId = ref({})

function userProgress(userId) {
  const p = progressByUserId.value[userId]
  if (!p || p.total === 0) return 0
  return Math.round((p.completed / p.total) * 100)
}

async function loadProgressForVisibleUsers(users) {
  const entries = await Promise.all(
    users.map(async (u) => {
      try {
        const assignments = await usersApi.getCourses(u.id)
        return [u.id, { completed: assignments.filter((a) => a.status === 'COMPLETED').length, total: assignments.length }]
      } catch {
        return [u.id, { completed: 0, total: 0 }]
      }
    })
  )
  progressByUserId.value = { ...progressByUserId.value, ...Object.fromEntries(entries) }
}

const allSelected = computed(() => items.value.length > 0 && selected.value.size === items.value.length)

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(items.value.map((u) => u.id))
}
function toggleOne(id) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

function buildParams() {
  const params = { page: page.value, limit: PAGE_SIZE }
  if (filters.search) params.search = filters.search
  if (filters.role) params.role = filters.role
  if (filters.branch) params.branch = filters.branch
  if (filters.department) params.department = filters.department
  if (filters.subdivision) params.subdivision = filters.subdivision
  if (filters.country) params.country = filters.country
  if (filters.status) params.status = filters.status
  return params
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  // Selection is per page: keeping ticks for rows that are no longer on
  // screen would make the bulk-deactivate count lie about what it affects.
  selected.value = new Set()
  try {
    const result = await usersApi.list(buildParams())
    items.value = result.items
    total.value = result.total
    totalPages.value = result.totalPages
    loadProgressForVisibleUsers(result.items)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
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

async function loadBranches() {
  try {
    branchOptions.value = await usersApi.branches()
  } catch {
    branchOptions.value = []
  }
}

async function loadAssignableCourses() {
  try {
    const result = await coursesApi.list({ status: 'PUBLISHED', limit: 100 })
    assignableCourses.value = result.items
  } catch {
    assignableCourses.value = []
  }
}

function toggleCourse(courseId) {
  const idx = createForm.courseIds.indexOf(courseId)
  if (idx === -1) createForm.courseIds.push(courseId)
  else createForm.courseIds.splice(idx, 1)
}

async function onCreateSubmit() {
  if (!fieldsValid.value) return

  createSubmitting.value = true
  createError.value = ''
  try {
    // Normalised here as well as on the server, so the value the admin sees in
    // the table is the one they typed minus the spaces they read it out with.
    const created = await usersApi.create({
      ...createForm,
      jshshir: normalizeJshshir(createForm.jshshir),
      passportSeries: normalizePassportSeries(createForm.passportSeries),
    })
    showCreateModal.value = false
    // Optional, skippable follow-up — face enrollment is never required to
    // finish creating an account (spec doesn't demand it happen in the same
    // breath, only that SUPERADMIN "have the ability" to upload a reference
    // photo). Offered right after creation since the new employee's id/name
    // is right here; also reachable later from their profile's Settings tab.
    pendingFaceEnrollUser.value = { id: created.id, fullName: created.fullName }
    Object.assign(createForm, { ...BLANK_USER, courseIds: [] })
    await loadFirstPage()
    toast.success(t('users.created'))
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

async function bulkDeactivate() {
  const ids = [...selected.value]
  if (!(await confirm.ask({ message: t('confirm.deactivateUsers', { count: ids.length }) }))) return
  await Promise.all(ids.map((id) => usersApi.deactivate(id)))
  toast.success(t('users.bulkDeactivated', { count: ids.length }))
  // Stay where the user was working. If a status filter emptied the last
  // page, step back rather than showing a blank table.
  await load()
  if (items.value.length === 0 && page.value > 1) await goToPage(page.value - 1)
}

onMounted(() => {
  load()
  directory.loadAll()
  loadBranches()
  loadAssignableCourses()
})
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-h1 text-ink">{{ t('users.title') }}</h1>
      <AppButton v-if="auth.hasPermission('user:create')" icon="plus" @click="showCreateModal = true">{{ t('users.newUser') }}</AppButton>
    </div>

    <!-- items-center, not items-end: none of these controls has a label, and
         the button is 4px shorter than the fields, so bottom alignment left
         it visibly sunk below the row. -->
    <div class="mt-5 flex flex-wrap items-center gap-3">
      <div class="w-56">
        <AppInput v-model="filters.search" icon="search" :placeholder="t('users.filters.search')" @keyup.enter="loadFirstPage" />
      </div>
      <div class="w-44">
        <AppSelect v-model="filters.role" :placeholder="t('users.filters.allRoles')" :options="directory.roleOptions.value" @update:model-value="loadFirstPage" />
      </div>
      <div class="w-44">
        <BranchSelect
          v-model="filters.branch"
          :options="branchOptions"
          :placeholder="t('users.filters.allBranches')"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div class="w-44">
        <AppSelect
          v-model="filters.department"
          :placeholder="t('users.filters.allDepartments')"
          :options="directory.optionsFor(ORG_LIST_TYPES.DEPARTMENT)"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div class="w-44">
        <AppSelect
          v-model="filters.subdivision"
          :placeholder="t('users.filters.allSubdivisions')"
          :options="directory.optionsFor(ORG_LIST_TYPES.SUBDIVISION)"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div class="w-44">
        <AppSelect
          v-model="filters.country"
          :placeholder="t('users.filters.allCountries')"
          :options="directory.optionsFor(ORG_LIST_TYPES.COUNTRY)"
          @update:model-value="loadFirstPage"
        />
      </div>
      <div class="w-44">
        <AppSelect
          v-model="filters.status"
          :placeholder="t('users.filters.allStatuses')"
          :options="statusOptions"
          @update:model-value="loadFirstPage"
        />
      </div>
      <AppButton variant="outline" icon="search" @click="loadFirstPage">{{ t('users.filters.apply') }}</AppButton>
      <AppButton v-if="hasActiveFilters" variant="ghost" icon="close" @click="clearFilters">
        {{ t('users.filters.clear') }}
      </AppButton>
    </div>

    <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1">
      <div v-if="selected.size > 0" class="mt-4 flex items-center justify-between rounded-lg border border-primary/25 bg-primary-subtle px-4 py-2.5">
        <p class="text-small font-medium text-primary">{{ selected.size }} {{ t('users.selected') }}</p>
        <AppButton variant="danger" size="sm" icon="trash" @click="bulkDeactivate">{{ t('users.deactivate') }}</AppButton>
      </div>
    </Transition>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div class="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-border text-caption font-semibold uppercase tracking-wide text-ink-faint">
            <th class="w-10 px-4 py-3"><input type="checkbox" :checked="allSelected" class="h-4 w-4 rounded border-border-strong" @change="toggleAll" /></th>
            <th class="px-2 py-3">{{ t('users.fields.fullName') }}</th>
            <th class="px-4 py-3">{{ t('users.role') }}</th>
            <th class="px-4 py-3">{{ t('users.fields.branch') }}</th>
            <th class="px-4 py-3">{{ t('users.fields.department') }}</th>
            <th class="px-4 py-3">{{ t('users.columns.progress') }}</th>
            <th class="px-4 py-3">{{ t('users.status') }}</th>
            <th class="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="i in 6" :key="i" class="border-b border-border last:border-0">
              <td class="px-4 py-3"><Skeleton class="h-4 w-4" /></td>
              <td class="px-2 py-3"><Skeleton class="h-4 w-40" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16" /></td>
              <td class="px-4 py-3" />
            </tr>
          </template>
          <tr
            v-for="user in items"
            :key="user.id"
            class="cursor-pointer border-b border-border text-small transition-default last:border-0 hover:bg-surface-2"
            @click="router.push(`/bos/users/${user.id}`)"
          >
            <td class="px-4 py-3" @click.stop>
              <input type="checkbox" :checked="selected.has(user.id)" class="h-4 w-4 rounded border-border-strong" @change="toggleOne(user.id)" />
            </td>
            <td class="px-2 py-3">
              <div class="flex items-center gap-2.5">
                <Avatar :name="user.fullName" :src="user.avatar" size="sm" />
                <div class="min-w-0">
                  <p class="truncate font-medium text-ink">{{ user.fullName }}</p>
                  <p class="truncate text-caption text-ink-faint">{{ user.jshshir }}</p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3"><Badge variant="neutral" size="sm">{{ user.role }}</Badge></td>
            <td class="px-4 py-3 text-ink-muted">{{ user.branch || '—' }}</td>
            <td class="px-4 py-3 text-ink-muted">{{ user.department || '—' }}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="w-20"><ProgressBar :value="userProgress(user.id)" size="sm" /></div>
                <span class="text-caption text-ink-faint">{{ userProgress(user.id) }}%</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <!-- Archived outranks inactive: both accounts are switched off,
                   but only one of them is a person who left, and that is the
                   distinction this column is asked about. -->
              <Badge v-if="user.isArchived" variant="neutral" dot size="sm">
                {{ t('users.filters.archived') }}
              </Badge>
              <Badge v-else :variant="user.isActive ? 'success' : 'danger'" dot size="sm">
                {{ user.isActive ? t('users.filters.active') : t('users.filters.inactive') }}
              </Badge>
            </td>
            <td class="px-4 py-3 text-ink-faint"><Icon name="chevron-right" size="15" /></td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && items.length === 0" icon="users" :title="t('users.empty')" />
    </div>

    <!-- Kept mounted whenever there are results, even for a single page, so
         the count stays visible and the table does not jump between pages. -->
    <div v-if="total > 0" class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-small text-ink-muted">
        {{ t('common.pagination.range', { from: rangeStart, to: rangeEnd, total }) }}
      </p>
      <Pagination v-if="totalPages > 1" :page="page" :total-pages="totalPages" @update:page="goToPage" />
    </div>

    <Modal v-model="showCreateModal" :title="t('users.newUser')" size="lg">
      <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onCreateSubmit">
        <EmployeeFormFields
          :form="createForm"
          :directory="directory"
          :branch-options="branchOptions"
          :can-manage-roles="auth.hasPermission('role:manage')"
          :can-manage-lists="auth.hasPermission('user:update')"
          @validity="fieldsValid = $event"
        />

        <p class="sm:col-span-2 mt-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">
          {{ t('users.sections.access') }}
        </p>
        <div class="sm:col-span-2">
          <GeneratedPasswordField v-model="createForm.password" required :label="t('users.fields.password')" />
        </div>

        <div class="sm:col-span-2">
          <p class="mb-1.5 text-small font-medium text-ink">{{ t('users.fields.assignCourses') }}</p>
          <div v-if="assignableCourses.length" class="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-border-strong p-3">
            <label v-for="course in assignableCourses" :key="course.id" class="flex items-center gap-2 text-small text-ink">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-border-strong text-primary"
                :checked="createForm.courseIds.includes(course.id)"
                @change="toggleCourse(course.id)"
              />
              {{ course.title }}
            </label>
          </div>
          <p v-else class="text-small text-ink-faint">{{ t('courses.empty') }}</p>
        </div>

        <p v-if="createError" class="sm:col-span-2 text-small text-danger">{{ createError }}</p>

        <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
          <AppButton type="button" variant="ghost" @click="showCreateModal = false">{{ t('users.cancel') }}</AppButton>
          <AppButton type="submit" :loading="createSubmitting">{{ createSubmitting ? t('users.creating') : t('users.create') }}</AppButton>
        </div>
      </form>
    </Modal>

    <FaceEnrollmentWizard
      v-if="pendingFaceEnrollUser"
      :model-value="Boolean(pendingFaceEnrollUser)"
      :user-id="pendingFaceEnrollUser.id"
      :user-name="pendingFaceEnrollUser.fullName"
      mode="enroll"
      @update:model-value="pendingFaceEnrollUser = null"
      @enrolled="pendingFaceEnrollUser = null"
    />
  </div>
</template>
