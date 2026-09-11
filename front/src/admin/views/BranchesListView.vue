<script setup>
// Branches, and what is attached to each one.
//
// Read-only on purpose: a branch is not an entity here, it is a value that
// people and courses are tagged with (User.branch, Course.branches). New ones
// are created where they are actually used — the branch picker on the employee
// form lets you type one. Renaming would have to rewrite every tagged record in
// step, or the courses targeted at the old name would quietly stop reaching
// anyone, so it is deliberately not offered from this page.
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { branchesApi } from '@/services/branches'
import { orgApi } from '@/services/org'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import AppInput from '@/components/ui/AppInput.vue'
import Modal from '@/components/ui/Modal.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Badge from '@/components/ui/Badge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')
// Name of the branch a delete is in flight for — the row is keyed by name and
// an undeclared one has nothing else to key it by.
const removing = ref('')

const totals = computed(() => ({
  branches: items.value.length,
  employees: items.value.reduce((sum, b) => sum + b.employees, 0),
  courses: items.value.reduce((sum, b) => sum + b.courses, 0),
}))

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await branchesApi.overview()
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

// The employees list already filters by branch, so this page hands off rather
// than growing its own copy of that table.
// The tree under a branch comes from the head-count structure (portal
// §8): departments and subdivisions are free-text on the user, so this is
// the only place they exist as a hierarchy.
const structure = ref(null)
const expanded = ref(new Set())
orgApi
  .structure()
  .then((result) => (structure.value = result))
  .catch(() => (structure.value = { branches: [] }))
function departmentsOf(branchName) {
  return structure.value?.branches.find((b) => b.name === branchName)?.departments ?? []
}
function toggleExpand(name) {
  const next = new Set(expanded.value)
  next.has(name) ? next.delete(name) : next.add(name)
  expanded.value = next
}

function openEmployees(branch) {
  router.push({ name: 'admin-users-list', query: { branch: branch.name } })
}

function openCourses(branch) {
  router.push({ name: 'admin-courses-list', query: { branch: branch.name } })
}

// One dialog for create and rename: the fields are the same, and `editing`
// holds the branch being renamed (null when creating).
const dialog = reactive({ open: false, editing: null, name: '', submitting: false, error: '' })

function openCreate() {
  Object.assign(dialog, { open: true, editing: null, name: '', error: '' })
}

function openRename(branch) {
  Object.assign(dialog, { open: true, editing: branch, name: branch.name, error: '' })
}

async function submitDialog() {
  const name = dialog.name.trim()
  if (!name) return
  dialog.submitting = true
  dialog.error = ''
  try {
    if (dialog.editing) {
      const result = await branchesApi.rename(dialog.editing.id, name)
      // Renaming rewrites the tagged records, so say how many moved — silently
      // touching dozens of employees is not something to leave unremarked.
      toast.success(t('branchesPage.renamed', { users: result.movedUsers, courses: result.movedCourses }))
    } else {
      await branchesApi.create(name)
    }
    dialog.open = false
    await load()
  } catch (error) {
    dialog.error = apiErrorText(error)
  } finally {
    dialog.submitting = false
  }
}

/**
 * Delete, with the confirmation carrying the consequence.
 *
 * An empty branch is a plain yes/no. One that still has employees or courses
 * in it is not: deleting it leaves those employees with no branch and pulls
 * the name out of every course targeting it — and a course left with no
 * branches at all is no longer branch-restricted, so it goes from reaching
 * that one office to reaching everybody. The counts are already on the card,
 * so the dialog can say all of that before anything is touched, and the
 * `force` flag is only sent once it has been read and accepted.
 */
async function removeBranch(branch) {
  const attached = branch.employees || branch.courses
  const message = attached
    ? t('branchesPage.confirmDeleteInUse', {
        name: branch.name,
        employees: branch.employees,
        courses: branch.courses,
      })
    : t('branchesPage.confirmDelete', { name: branch.name })

  if (!(await confirm.ask({ message, confirmLabel: t('branchesPage.delete') }))) return

  removing.value = branch.name
  try {
    const result = branch.id
      ? await branchesApi.remove(branch.id, { force: true })
      : await branchesApi.removeByName(branch.name, { force: true })
    toast.success(
      result.detachedUsers || result.detachedCourses
        ? t('branchesPage.deletedDetached', {
            name: result.name,
            users: result.detachedUsers,
            courses: result.detachedCourses,
          })
        : t('branchesPage.deleted', { name: result.name })
    )
    await load()
  } catch (error) {
    // The server refuses a branch that is still in use and says how much is
    // attached; that message is the useful part, so pass it straight through.
    toast.error(apiErrorText(error))
  } finally {
    removing.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="px-6 py-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('branchesPage.title') }}</h1>
        <p class="mt-1 text-small text-ink-faint">{{ t('branchesPage.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <div v-if="!loading && items.length" class="hidden gap-2 text-caption text-ink-faint sm:flex">
          <span>{{ t('branchesPage.totals.branches', { count: totals.branches }) }}</span>
          <span>·</span>
          <span>{{ t('branchesPage.totals.employees', { count: totals.employees }) }}</span>
        </div>
        <AppButton icon="plus" @click="openCreate">{{ t('branchesPage.create') }}</AppButton>
      </div>
    </div>

    <div v-if="loading" class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 6" :key="i" class="h-28 rounded-lg" />
    </div>

    <ErrorState v-else-if="errorMessage" class="mt-6" :title="t('branchesPage.errorTitle')" :description="errorMessage">
      <template #actions>
        <AppButton variant="outline" icon="refresh" @click="load">{{ t('common.retry') }}</AppButton>
      </template>
    </ErrorState>

    <EmptyState
      v-else-if="!items.length"
      class="mt-6"
      icon="building"
      :title="t('branchesPage.empty.title')"
      :description="t('branchesPage.empty.description')"
    >
      <template #action>
        <AppButton icon="plus" @click="openCreate">{{ t('branchesPage.create') }}</AppButton>
      </template>
    </EmptyState>

    <!-- Rasn 9: a tree table — the branch, its departments under it,
         their subdivisions under those; code, head, head-count. Codes and
         heads are not on the model, and the column says so with "—". -->
    <div v-else class="mt-6 overflow-x-auto">
      <table class="w-full min-w-[720px] text-[14px]">
        <thead>
          <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
            <th class="pl-3 pr-2 font-medium">{{ t('branchesPage.columns.name') }}</th>
            <th class="w-40 px-2 font-medium">{{ t('branchesPage.columns.code') }}</th>
            <th class="w-48 px-2 font-medium">{{ t('branchesPage.columns.head') }}</th>
            <th class="w-40 px-2 font-medium">{{ t('branchesPage.columns.total') }}</th>
            <th class="w-24 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="branch in items" :key="branch.name">
            <tr class="h-14 border-b border-border transition-default hover:bg-surface-2">
              <td class="pl-3 pr-2">
                <span class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex h-6 w-6 items-center justify-center rounded text-ink-faint transition-default hover:bg-surface-hover"
                    :class="departmentsOf(branch.name).length ? '' : 'invisible'"
                    :aria-expanded="expanded.has(branch.name)"
                    :aria-label="t('common.viewDetails')"
                    @click="toggleExpand(branch.name)"
                  >
                    <Icon :name="expanded.has(branch.name) ? 'chevron-down' : 'chevron-right'" size="14" />
                  </button>
                  <Icon name="building" size="18" class="text-ink-muted" />
                  <button type="button" class="text-ink hover:text-primary" @click="openEmployees(branch)">{{ branch.name }}</button>
                  <Badge v-if="!branch.employees" variant="warning" size="sm">{{ t('branchesPage.noEmployees') }}</Badge>
                </span>
              </td>
              <td class="px-2 text-ink-muted">—</td>
              <td class="px-2 text-ink-muted">—</td>
              <td class="px-2 text-ink">{{ branch.employees }}</td>
              <td class="pr-3 text-right">
                <span class="flex justify-end gap-1">
                  <button
                    type="button"
                    :disabled="!branch.id"
                    class="grid h-8 w-8 place-items-center rounded-md text-ink-faint transition-default hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    :title="branch.id ? t('branchesPage.rename') : t('branchesPage.undeclaredHint')"
                    @click="openRename(branch)"
                  >
                    <Icon name="pencil" size="15" />
                  </button>
                  <button
                    type="button"
                    :disabled="removing === branch.name"
                    class="grid h-8 w-8 place-items-center rounded-md text-ink-faint transition-default hover:bg-danger-subtle hover:text-danger disabled:opacity-40"
                    :title="t('branchesPage.delete')"
                    @click="removeBranch(branch)"
                  >
                    <Icon name="trash" size="15" />
                  </button>
                </span>
              </td>
            </tr>
            <template v-if="expanded.has(branch.name)">
              <template v-for="dept in departmentsOf(branch.name)" :key="`${branch.name}/${dept.name}`">
                <tr class="h-12 border-b border-border transition-default hover:bg-surface-2">
                  <td class="pl-12 pr-2">
                    <span class="flex items-center gap-2">
                      <Icon name="building" size="16" class="text-ink-faint" />
                      <router-link :to="{ name: 'admin-users-list', query: { branch: branch.name, department: dept.name } }" class="text-ink hover:text-primary">{{ dept.name || t('portal.employees.unassigned') }}</router-link>
                    </span>
                  </td>
                  <td class="px-2 text-ink-muted">—</td>
                  <td class="px-2 text-ink-muted">—</td>
                  <td class="px-2 text-ink">{{ dept.count }}</td>
                  <td></td>
                </tr>
                <tr v-for="sub in dept.subdivisions" :key="`${branch.name}/${dept.name}/${sub.name}`" class="h-11 border-b border-border text-ink-muted">
                  <td class="pl-20 pr-2">{{ sub.name }}</td>
                  <td class="px-2">—</td>
                  <td class="px-2">—</td>
                  <td class="px-2 text-ink">{{ sub.count }}</td>
                  <td></td>
                </tr>
              </template>
            </template>
          </template>
        </tbody>
      </table>
    </div>

    <Modal
      v-model="dialog.open"
      :title="dialog.editing ? t('branchesPage.rename') : t('branchesPage.create')"
      :description="dialog.editing ? t('branchesPage.renameHint') : t('branchesPage.createHint')"
      size="sm"
    >
      <AppInput v-model="dialog.name" :label="t('branchesPage.name')" @keyup.enter="submitDialog" />
      <p v-if="dialog.error" class="mt-2 text-small text-danger">{{ dialog.error }}</p>

      <template #footer>
        <AppButton variant="ghost" @click="dialog.open = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="dialog.submitting" :disabled="!dialog.name.trim()" @click="submitDialog">
          {{ t('common.save') }}
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
