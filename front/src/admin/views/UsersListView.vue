<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabel } from '@/utils/roleLabel'
import { useRoute, useRouter } from 'vue-router'
import { ROLES, normalizeJshshir } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { useOrgDirectory } from '@/composables/useOrgDirectory'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import EmployeeFormFields from '@/admin/components/employee/EmployeeFormFields.vue'
import GeneratedPasswordField from '@/components/ui/GeneratedPasswordField.vue'
import FaceEnrollmentWizard from '@/components/face/FaceEnrollmentWizard.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Pagination from '@/components/ui/Pagination.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import UserBulkActionsBar from '@/admin/components/users/UserBulkActionsBar.vue'
import UserActionsHost from '@/admin/components/users/UserActionsHost.vue'
import BulkGroupCreateModal from '@/admin/components/users/BulkGroupCreateModal.vue'
import BulkGroupMembersModal from '@/admin/components/users/BulkGroupMembersModal.vue'
import UserImportWizard from '@/admin/components/users/UserImportWizard.vue'
import { apiErrorText } from '@/utils/apiError'
import { formatDate, formatDateTime } from '@/utils/format'

const { t, te, locale } = useI18n()
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
const filters = reactive({
  ...EMPTY_FILTERS,
  branch: route.query.branch ?? '',
  department: route.query.department ?? '',
  subdivision: route.query.subdivision ?? '',
})

// Three answers to "who works here", not two: archived is someone who left,
// which is a different thing from an account switched off while the person is
// still on the payroll.
const statusOptions = computed(() => [
  { value: 'working', label: t('users.filters.working') },
  { value: 'archived', label: t('users.filters.archived') },
  { value: 'active', label: t('users.filters.active') },
  { value: 'inactive', label: t('users.filters.inactive') },
])

// One list, read twice: FilterBar renders the controls from it and derives
// "is anything filtered" from the same keys, so a filter added here cannot
// end up uncleaarable because someone forgot the second list.
const filterFields = computed(() => [
  { key: 'search', type: 'search', width: 'w-56', placeholder: t('users.filters.search') },
  { key: 'role', type: 'select', placeholder: t('users.filters.allRoles'), options: directory.roleOptions.value },
  { key: 'branch', type: 'branch', placeholder: t('users.filters.allBranches'), options: branchOptions.value },
  {
    key: 'department',
    type: 'select',
    placeholder: t('users.filters.allDepartments'),
    options: directory.optionsFor(ORG_LIST_TYPES.DEPARTMENT),
  },
  {
    key: 'subdivision',
    type: 'select',
    placeholder: t('users.filters.allSubdivisions'),
    options: directory.optionsFor(ORG_LIST_TYPES.SUBDIVISION),
  },
  {
    key: 'country',
    type: 'select',
    placeholder: t('users.filters.allCountries'),
    options: directory.optionsFor(ORG_LIST_TYPES.COUNTRY),
  },
  { key: 'status', type: 'select', placeholder: t('users.filters.allStatuses'), options: statusOptions.value },
])

// Rasn 6's columns: name (with the id under it), status as an icon,
// department with the branch as its path, progress, role — shown by
// default. Everything else on the record is offered under the ⚙ (rasm
// 1.09's list: id, groups, added, last login, the name parts, login,
// contacts, position, country, birth date, gender, address, dates), hidden
// until somebody ticks it.
const columns = computed(() => [
  { key: 'fullName', label: t('users.fields.fullName'), skeletonWidth: 'w-40' },
  { key: 'id', label: 'ID', hidden: true, cellClass: 'font-mono text-caption text-ink-faint' },
  { key: 'status', label: t('users.status'), skeletonWidth: 'w-6', width: 'w-20' },
  { key: 'department', label: t('users.fields.department') },
  { key: 'groups', label: t('users.columns.groups'), hidden: true },
  { key: 'progress', label: t('users.columns.progress'), skeletonWidth: 'w-16', width: 'w-40' },
  { key: 'role', label: t('users.role'), skeletonWidth: 'w-20', width: 'w-36' },
  { key: 'createdAt', label: t('users.columns.createdAt'), hidden: true },
  { key: 'lastLoginAt', label: t('users.columns.lastLoginAt'), hidden: true },
  { key: 'firstName', label: t('users.fields.firstName'), hidden: true },
  { key: 'lastName', label: t('users.fields.lastName'), hidden: true },
  { key: 'patronymic', label: t('users.fields.patronymic'), hidden: true },
  { key: 'jshshir', label: t('users.fields.jshshir'), hidden: true, cellClass: 'font-mono' },
  { key: 'email', label: t('users.fields.email'), hidden: true },
  { key: 'phone', label: t('users.fields.phone'), hidden: true },
  { key: 'position', label: t('users.fields.position'), hidden: true },
  { key: 'managerName', label: t('users.fields.manager'), hidden: true },
  { key: 'country', label: t('users.fields.country'), hidden: true },
  { key: 'birthDate', label: t('users.fields.birthDate'), hidden: true },
  { key: 'gender', label: t('users.fields.gender'), hidden: true },
  { key: 'address', label: t('users.fields.address'), hidden: true },
  { key: 'hireDate', label: t('users.columns.hireDate'), hidden: true },
  { key: 'terminationDate', label: t('users.columns.terminationDate'), hidden: true },
])

const genderLabel = (value) => (value ? t(value === 'MALE' ? 'users.fields.genderMale' : 'users.fields.genderFemale') : '')
const filtersOpen = ref(false)
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
const showImportWizard = ref(route.query.import === '1')
const createSubmitting = ref(false)
const createError = ref('')
const BLANK_USER = {
  firstName: '',
  lastName: '',
  patronymic: '',
  jshshir: '',
  managerId: '',
  managerName: '',
  email: '',
  phone: '',
  roleNames: [ROLES.EMPLOYEE],
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

function clearSelection() {
  selected.value = new Set()
}

// The rows behind the ticks, in the order they appear in the table. Derived
// from `items` rather than kept alongside the id set, so there is still only
// one selection state and it cannot drift out of step with what is on screen.
const selectedUsers = computed(() => items.value.filter((user) => selected.value.has(user.id)))

// ---------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------

// Read this list, write to these people, put them in a group, switch them
// off — three different permissions, checked here so the buttons match what
// the API will actually allow. The endpoints check the same things again;
// hiding a button is a courtesy, not the rule.
const canBulkMessage = computed(() => auth.hasPermission('user:read'))
const canManageGroups = computed(() => auth.hasPermission('course:assign'))
const canDeactivate = computed(() => auth.hasPermission('user:delete'))

// The modals and confirmations behind every action live in one host
// component (shared with the profile's ⋯); the bar only names the action.
const actionsHost = ref(null)
function onBulkAction(action) {
  if (action === 'group-create') showGroupCreate.value = true
  else if (action === 'group-remove') openGroupMembers('remove')
  else actionsHost.value?.open(action)
}

const showGroupCreate = ref(false)
const showGroupMembers = ref(false)
const groupMembersMode = ref('add')
const bulkBusy = ref(false)

function openGroupMembers(mode) {
  groupMembersMode.value = mode
  showGroupMembers.value = true
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
    const { managerName: _name, ...rest } = createForm
    const created = await usersApi.create({
      ...rest,
      jshshir: normalizeJshshir(createForm.jshshir),
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
    createError.value = apiErrorText(error)
  } finally {
    createSubmitting.value = false
  }
}

// Every action has been acted on, so the selection goes; the rows are
// reloaded because most of them (block, dismiss, delete, department) change
// what the table shows. If that emptied the last page, step back rather
// than showing a blank table.
async function onBulkFinished() {
  clearSelection()
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
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-[24px] font-semibold text-ink">{{ t('users.title') }}</h1>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-muted transition-default hover:bg-surface-hover hover:text-ink"
          :aria-label="t('common.filter')"
          :aria-expanded="filtersOpen"
          @click="filtersOpen = !filtersOpen"
        >
          <Icon name="filter" size="18" />
        </button>
        <!-- Its own permission (§8.2): creating one account and creating
             three hundred are different decisions. -->
        <AppButton
          v-if="auth.hasPermission('user:import')"
          variant="secondary"
          icon="upload"
          @click="showImportWizard = true"
        >
          {{ t('userImport.open') }}
        </AppButton>
        <AppButton v-if="auth.hasPermission('user:create')" icon="user-plus" @click="showCreateModal = true">{{ t('users.newUser') }}</AppButton>
      </div>
    </div>

    <!-- "Jami: N" on the left, "1–25 / N" with ‹ › on the right (rasn 6) -->
    <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p class="text-[18px] font-medium text-ink">{{ t('common.total') }}: {{ total }}</p>
      <div v-if="total > 0" class="flex items-center gap-2 text-[13px] text-ink-muted">
        <span>{{ t('common.pagination.range', { from: rangeStart, to: rangeEnd, total }) }}</span>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md transition-default hover:bg-surface-2 disabled:opacity-40" :disabled="page === 1" :aria-label="t('a11y.previousPage')" @click="goToPage(page - 1)"><Icon name="chevron-left" size="16" /></button>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md transition-default hover:bg-surface-2 disabled:opacity-40" :disabled="page >= totalPages" :aria-label="t('a11y.nextPage')" @click="goToPage(page + 1)"><Icon name="chevron-right" size="16" /></button>
      </div>
    </div>

    <UserImportWizard v-model="showImportWizard" @imported="loadFirstPage" />

    <FilterBar
      v-if="filtersOpen"
      v-model="filters"
      class="mt-5"
      :fields="filterFields"
      :apply-label="t('users.filters.apply')"
      :clear-label="t('users.filters.clear')"
      @apply="loadFirstPage"
    />

    <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1">
      <div v-if="selected.size > 0" class="mt-4">
        <UserBulkActionsBar
          :count="selected.size"
          :busy="bulkBusy || Boolean(actionsHost?.busy)"
          :can-message="canBulkMessage"
          :can-assign="auth.hasPermission('course:assign')"
          :can-manage-groups="canManageGroups"
          :can-update="auth.hasPermission('user:update')"
          :can-deactivate="canDeactivate"
          :can-delete="auth.isSuperAdmin"
          @action="onBulkAction"
          @clear="clearSelection"
        />
      </div>
    </Transition>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <DataTable
      settings-key="users"
      v-model:selected="selected"
      class="mt-4"
      :columns="columns"
      :rows="items"
      :loading="loading"
      selectable
      clickable-rows
      chevron
      empty-icon="users"
      :empty-title="t('users.empty')"
      @row-click="router.push(`/bos/users/${$event.id}`)"
    >
      <template #cell-fullName="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :name="row.fullName" :src="row.avatar" size="sm" />
          <div class="min-w-0">
            <p class="truncate font-medium text-ink">{{ row.fullName }}</p>
            <p class="truncate text-caption text-ink-faint">{{ row.jshshir }}</p>
          </div>
        </div>
      </template>

      <template #cell-role="{ row }">
        <span class="flex flex-wrap gap-1">
          <Badge v-for="name in row.roles?.length ? row.roles : [row.role]" :key="name" variant="neutral" size="sm">{{ roleLabel(name, { t, te }) }}</Badge>
        </span>
      </template>

      <template #cell-department="{ row }">
        <p class="text-ink">{{ row.department || '—' }}</p>
        <p v-if="row.branch" class="text-caption text-ink-muted">{{ row.branch }}</p>
      </template>

      <template #cell-progress="{ row }">
        <div class="flex items-center gap-2">
          <div class="w-20"><ProgressBar :value="userProgress(row.id)" size="sm" /></div>
          <span class="text-caption text-ink-faint">{{ userProgress(row.id) }}%</span>
        </div>
      </template>

      <template #cell-groups="{ row }">
        <span class="text-ink">{{ row.groups?.length ? row.groups.join(', ') : '—' }}</span>
      </template>
      <template #cell-createdAt="{ row }">{{ formatDate(row.createdAt, locale) }}</template>
      <template #cell-lastLoginAt="{ row }">{{ row.lastLoginAt ? formatDateTime(row.lastLoginAt, locale) : '—' }}</template>
      <template #cell-birthDate="{ row }">{{ row.birthDate ? formatDate(row.birthDate, locale) : '—' }}</template>
      <template #cell-hireDate="{ row }">{{ row.hireDate ? formatDate(row.hireDate, locale) : '—' }}</template>
      <template #cell-terminationDate="{ row }">{{ row.terminationDate ? formatDate(row.terminationDate, locale) : '—' }}</template>
      <template #cell-gender="{ row }">{{ genderLabel(row.gender) || '—' }}</template>

      <template #cell-status="{ row }">
        <!-- Rasn 6: an active account shows nothing; a switched-off one an
             icon. Archived outranks inactive: both accounts are off, but
             only one of them is a person who left. -->
        <span v-if="row.isArchived" class="text-ink-faint" :title="t('users.filters.archived')"><Icon name="log-out" size="16" /></span>
        <span v-else-if="!row.isActive" class="text-ink-faint" :title="t('users.filters.inactive')"><Icon name="eye-off" size="16" /></span>
        <span v-else aria-hidden="true"></span>
      </template>
    </DataTable>

    <div v-if="totalPages > 1" class="mt-4 flex justify-end">
      <Pagination :page="page" :total-pages="totalPages" @update:page="goToPage" />
    </div>

    <!-- New user: a page of its own (rasn 7) — back arrow, the title, a
         card with "general information" and Save at the top right -->
    <div v-if="showCreateModal" class="fixed inset-x-0 bottom-0 top-16 z-20 overflow-y-auto bg-surface-2 lg:left-14">
      <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
        <div class="flex items-center gap-4">
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('common.back')" @click="showCreateModal = false">
            <Icon name="arrow-left" size="20" />
          </button>
          <h1 class="text-[24px] font-semibold text-ink">{{ t('users.newUser') }}</h1>
        </div>
        <form class="mt-4 rounded-2xl bg-surface p-8 shadow-sm" @submit.prevent="onCreateSubmit">
          <div class="flex items-center justify-between gap-4 border-b border-border pb-5">
            <p class="text-[15px] text-ink">{{ t('users.sections.personal') }}</p>
            <AppButton type="submit" :loading="createSubmitting">{{ createSubmitting ? t('users.creating') : t('common.save') }}</AppButton>
          </div>
          <!-- One field per row, label on the left — the reference form (rasm) -->
          <div class="mt-6 space-y-4">
            <EmployeeFormFields
              :form="createForm"
              :directory="directory"
              :branch-options="branchOptions"
              :can-manage-roles="auth.hasPermission('role:manage')"
              :can-manage-lists="auth.hasPermission('user:update')"
              @validity="fieldsValid = $event"
            />

            <div class="my-2 border-t border-border sm:max-w-[624px]" />

            <div class="grid grid-cols-1 gap-y-1 sm:grid-cols-[200px_minmax(0,400px)] sm:items-start sm:gap-x-6">
              <span class="text-small text-ink-muted sm:pt-2.5"><span class="text-danger" aria-hidden="true">* </span>{{ t('users.fields.password') }}</span>
              <GeneratedPasswordField v-model="createForm.password" required :aria-label="t('users.fields.password')" />
            </div>

            <div class="grid grid-cols-1 gap-y-1 sm:grid-cols-[200px_minmax(0,400px)] sm:items-start sm:gap-x-6">
              <span class="text-small text-ink-muted sm:pt-1">{{ t('users.fields.assignCourses') }}</span>
              <div>
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
            </div>

            <p v-if="createError" class="text-small text-danger">{{ createError }}</p>
          </div>
        </form>
      </div>
    </div>

    <UserActionsHost ref="actionsHost" :users="selectedUsers" @done="onBulkFinished" />
    <BulkGroupCreateModal v-model="showGroupCreate" :users="selectedUsers" @created="onBulkFinished" />
    <BulkGroupMembersModal
      v-model="showGroupMembers"
      :mode="groupMembersMode"
      :users="selectedUsers"
      @done="onBulkFinished"
    />

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
