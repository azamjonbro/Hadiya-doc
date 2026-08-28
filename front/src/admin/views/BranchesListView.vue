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

async function removeBranch(branch) {
  if (!(await confirm({ message: t('branchesPage.confirmDelete', { name: branch.name }) }))) return
  try {
    await branchesApi.remove(branch.id)
    await load()
  } catch (error) {
    // The server refuses a branch that is still in use and says how much is
    // attached; that message is the useful part, so pass it straight through.
    toast.error(apiErrorText(error))
  }
}

onMounted(load)
</script>

<template>
  <div class="px-6 py-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-h1 text-ink">{{ t('branchesPage.title') }}</h1>
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

    <div v-else class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AppCard v-for="branch in items" :key="branch.name" hover>
        <div class="flex items-start gap-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary">
            <Icon name="building" size="18" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-body font-semibold text-ink">{{ branch.name }}</h2>
            <!-- A branch nobody is in yet is the interesting case: it means a
                 course was targeted at an office before anyone was moved into
                 it, and that course currently reaches nobody. -->
            <Badge v-if="!branch.employees" variant="warning" size="sm" class="mt-1">
              {{ t('branchesPage.noEmployees') }}
            </Badge>
          </div>

          <!-- Only branches that exist as a record can be renamed or removed.
               A name that is merely in use on employee records has nothing to
               act on — creating it here first is what gives it one. -->
          <div v-if="branch.id" class="flex shrink-0 gap-1">
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
              :title="t('branchesPage.rename')"
              @click="openRename(branch)"
            >
              <Icon name="pencil" size="14" />
            </button>
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded text-ink-faint transition-default hover:bg-danger-subtle hover:text-danger"
              :title="t('branchesPage.delete')"
              @click="removeBranch(branch)"
            >
              <Icon name="trash" size="14" />
            </button>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-md border border-border p-2.5 text-left transition-default hover:border-border-strong hover:bg-surface-2"
            @click="openEmployees(branch)"
          >
            <p class="text-h3 leading-none text-ink">{{ branch.employees }}</p>
            <p class="mt-1 text-caption text-ink-faint">
              {{ t('branchesPage.employees') }}
              <template v-if="branch.employees && branch.activeEmployees !== branch.employees">
                · {{ t('branchesPage.activeOf', { active: branch.activeEmployees }) }}
              </template>
            </p>
          </button>

          <button
            type="button"
            class="rounded-md border border-border p-2.5 text-left transition-default hover:border-border-strong hover:bg-surface-2"
            @click="openCourses(branch)"
          >
            <p class="text-h3 leading-none text-ink">{{ branch.courses }}</p>
            <p class="mt-1 text-caption text-ink-faint">{{ t('branchesPage.courses') }}</p>
          </button>
        </div>
      </AppCard>
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
