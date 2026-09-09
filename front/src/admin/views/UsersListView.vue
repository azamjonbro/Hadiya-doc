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
import AppButton from '@/components/ui/AppButton.vue'
import EmployeeFormFields from '@/admin/components/employee/EmployeeFormFields.vue'
import GeneratedPasswordField from '@/components/ui/GeneratedPasswordField.vue'
import Modal from '@/components/ui/Modal.vue'
import FaceEnrollmentWizard from '@/components/face/FaceEnrollmentWizard.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Pagination from '@/components/ui/Pagination.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import UserBulkActionsBar from '@/admin/components/users/UserBulkActionsBar.vue'
import BulkMessageModal from '@/admin/components/users/BulkMessageModal.vue'
import BulkGroupCreateModal from '@/admin/components/users/BulkGroupCreateModal.vue'
import BulkGroupMembersModal from '@/admin/components/users/BulkGroupMembersModal.vue'
import UserImportWizard from '@/admin/components/users/UserImportWizard.vue'
import { apiErrorText } from '@/utils/apiError'

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

const columns = computed(() => [
  { key: 'fullName', label: t('users.fields.fullName'), skeletonWidth: 'w-40' },
  { key: 'role', label: t('users.role'), skeletonWidth: 'w-20' },
  { key: 'branch', label: t('users.fields.branch') },
  { key: 'department', label: t('users.fields.department') },
  { key: 'progress', label: t('users.columns.progress'), skeletonWidth: 'w-16' },
  { key: 'status', label: t('users.status'), skeletonWidth: 'w-16' },
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
const showImportWizard = ref(false)
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

const showBulkMessage = ref(false)
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
    createError.value = apiErrorText(error)
  } finally {
    createSubmitting.value = false
  }
}

async function bulkDeactivate() {
  const ids = [...selected.value]
  if (!ids.length) return

  const confirmed = await confirm.ask({
    title: t('users.bulk.deactivateTitle'),
    message: t('confirm.deactivateUsers', { count: ids.length }),
    confirmLabel: t('users.deactivate'),
  })
  if (!confirmed) return

  bulkBusy.value = true
  try {
    // One request, not one per row: the server checks every id, switches the
    // eligible ones off in a single write, and answers with what it did — so
    // a selection containing somebody this admin may not touch no longer
    // half-applies and no longer needs the browser to reconcile N promises.
    const result = await usersApi.bulkDeactivate(ids)

    if (result.deactivated > 0) toast.success(t('users.bulkDeactivated', { count: result.deactivated }))
    if (result.skipped?.length) toast.info(t('users.bulk.alreadyInactive', { count: result.skipped.length }))
    if (result.failed?.length) toast.warning(t('users.bulk.deactivateFailed', { count: result.failed.length }))
    if (!result.deactivated && !result.skipped?.length) toast.error(t('users.bulk.nothingDone'))

    // Stay where the user was working. If a status filter emptied the last
    // page, step back rather than showing a blank table. `load()` clears the
    // selection on its way through.
    await load()
    if (items.value.length === 0 && page.value > 1) await goToPage(page.value - 1)
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    bulkBusy.value = false
  }
}

// Messaging and group membership change nothing this table renders, so they
// only drop the ticks — reloading would cost a page fetch to redraw the same
// rows. The selection goes either way: it has been acted on.
function onBulkFinished() {
  clearSelection()
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
      <div class="flex items-center gap-2">
        <!-- Its own permission (§8.2): creating one account and creating
             three hundred are different decisions. -->
        <AppButton
          v-if="auth.hasPermission('user:import')"
          variant="outline"
          icon="upload"
          @click="showImportWizard = true"
        >
          {{ t('userImport.open') }}
        </AppButton>
        <AppButton v-if="auth.hasPermission('user:create')" icon="plus" @click="showCreateModal = true">{{ t('users.newUser') }}</AppButton>
      </div>
    </div>

    <UserImportWizard v-model="showImportWizard" @imported="loadFirstPage" />

    <FilterBar
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
          :busy="bulkBusy"
          :can-message="canBulkMessage"
          :can-manage-groups="canManageGroups"
          :can-deactivate="canDeactivate"
          @message="showBulkMessage = true"
          @group-create="showGroupCreate = true"
          @group-add="openGroupMembers('add')"
          @group-remove="openGroupMembers('remove')"
          @deactivate="bulkDeactivate"
          @clear="clearSelection"
        />
      </div>
    </Transition>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <DataTable
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
        <Badge variant="neutral" size="sm">{{ row.role }}</Badge>
      </template>

      <template #cell-branch="{ row }"><span class="text-ink-muted">{{ row.branch || '—' }}</span></template>
      <template #cell-department="{ row }"><span class="text-ink-muted">{{ row.department || '—' }}</span></template>

      <template #cell-progress="{ row }">
        <div class="flex items-center gap-2">
          <div class="w-20"><ProgressBar :value="userProgress(row.id)" size="sm" /></div>
          <span class="text-caption text-ink-faint">{{ userProgress(row.id) }}%</span>
        </div>
      </template>

      <template #cell-status="{ row }">
        <!-- Archived outranks inactive: both accounts are switched off, but
             only one of them is a person who left, and that is the
             distinction this column is asked about. -->
        <Badge v-if="row.isArchived" variant="neutral" dot size="sm">
          {{ t('users.filters.archived') }}
        </Badge>
        <Badge v-else :variant="row.isActive ? 'success' : 'danger'" dot size="sm">
          {{ row.isActive ? t('users.filters.active') : t('users.filters.inactive') }}
        </Badge>
      </template>
    </DataTable>

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

    <BulkMessageModal v-model="showBulkMessage" :users="selectedUsers" @sent="onBulkFinished" />
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
