<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { groupsApi } from '@/services/groups'
import { usersApi } from '@/services/users'
import { ROLES } from '@lms/shared'
import { roleLabel } from '@/utils/roleLabel'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, te } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const canManage = auth.hasPermission('course:assign')

const loading = ref(true)
const errorMessage = ref('')
const groups = ref([])
const search = ref('')

const showCreate = ref(false)
const creating = ref(false)
const createError = ref('')
const createForm = reactive({ name: '', description: '', department: '' })

// «Yangi smart-guruh» (rasm «Группы»): a group whose members are whoever
// matches a rule — roles, departments, branches, positions — recomputed
// daily and on save. The lists the rule picks from load when the dialog
// first opens.
const showSmart = ref(false)
const smartForm = reactive({ name: '', description: '', roles: [], departments: [], branches: [], positions: [] })
const lists = reactive({ departments: [], branches: [], positions: [] })
const roleOptions = Object.values(ROLES)
async function openSmart() {
  Object.assign(smartForm, { name: '', description: '', roles: [], departments: [], branches: [], positions: [] })
  createError.value = ''
  showSmart.value = true
  if (!lists.departments.length && !lists.branches.length) {
    try {
      const [departments, branches, positions] = await Promise.all([usersApi.departments(), usersApi.branches(), usersApi.positions()])
      Object.assign(lists, { departments, branches, positions })
    } catch {
      // The rule can still be typed by role; the other lists stay empty.
    }
  }
}
function toggleIn(list, value) {
  const index = list.indexOf(value)
  if (index === -1) list.push(value)
  else list.splice(index, 1)
}
const smartRuleEmpty = computed(() => !smartForm.roles.length && !smartForm.departments.length && !smartForm.branches.length && !smartForm.positions.length)
async function onCreateSmart() {
  creating.value = true
  createError.value = ''
  try {
    const group = await groupsApi.create({
      name: smartForm.name,
      description: smartForm.description,
      type: 'DYNAMIC',
      rule: { roles: smartForm.roles, departments: smartForm.departments, branches: smartForm.branches, positions: smartForm.positions },
    })
    showSmart.value = false
    toast.success(t('groups.created'))
    router.push(`/bos/groups/${group.id}`)
  } catch (error) {
    createError.value = apiErrorText(error)
  } finally {
    creating.value = false
  }
}

const selected = ref(new Set())
const allSelected = computed(() => groups.value.length > 0 && selected.value.size === groups.value.length)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(groups.value.map((g) => g.id))
}
function toggleOne(id) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const sortDir = ref('asc')
const sortedGroups = computed(() => [...groups.value].sort((a, b) => a.name.localeCompare(b.name) * (sortDir.value === 'asc' ? 1 : -1)))

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    groups.value = await groupsApi.list(search.value ? { search: search.value } : {})
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  createForm.name = ''
  createForm.description = ''
  createForm.department = ''
  createError.value = ''
  showCreate.value = true
}

async function onCreate() {
  creating.value = true
  createError.value = ''
  try {
    const group = await groupsApi.create({ ...createForm })
    showCreate.value = false
    toast.success(t('groups.created'))
    router.push(`/bos/groups/${group.id}`)
  } catch (error) {
    createError.value = apiErrorText(error)
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <!-- Rasn 10: title, one line of help, "New group" on the right; the
         search is a small field under it; then a flat table with a
         group icon, the name and the head-count -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('groups.title') }}</h1>
        <p class="mt-1 max-w-2xl text-[14px] text-ink-muted">{{ t('groups.emptyHint') }}</p>
      </div>
      <div v-if="canManage" class="flex flex-wrap items-center gap-2">
        <AppButton variant="secondary" icon="settings" @click="openSmart">{{ t('groups.newSmartGroup') }}</AppButton>
        <AppButton icon="users" @click="openCreate">{{ t('groups.newGroup') }}</AppButton>
      </div>
    </div>

    <form class="mt-5 flex flex-wrap items-center gap-3" @submit.prevent="load">
      <div class="w-full max-w-xs">
        <AppInput v-model="search" :placeholder="t('groups.searchPlaceholder')" icon="search" />
      </div>
    </form>

    <div v-if="loading" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-32 w-full" />
    </div>

    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <EmptyState
      v-else-if="!groups.length"
      icon="users"
      :title="t('groups.empty')"
      :description="t('groups.emptyHint')"
    >
      <template v-if="canManage" #action>
        <AppButton icon="plus" @click="openCreate">{{ t('groups.newGroup') }}</AppButton>
      </template>
    </EmptyState>

    <table v-else class="mt-5 w-full text-[14px]">
      <thead>
        <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
          <th class="w-10 pl-3"><input type="checkbox" class="h-4 w-4 rounded border-border-strong" :checked="allSelected" :aria-label="t('common.all')" @change="toggleAll" /></th>
          <th class="pr-2 font-medium text-ink">
            <button type="button" class="inline-flex items-center gap-1 hover:text-ink" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
              {{ t('groups.fields.name') }} <Icon :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" size="12" class="text-ink-faint" />
            </button>
          </th>
          <th class="w-40 px-2 font-medium">{{ t('courses.title') }}</th>
          <th class="w-40 pr-3 font-medium">{{ t('users.title') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="group in sortedGroups"
          :key="group.id"
          class="h-14 cursor-pointer border-b border-border transition-default last:border-b-0 hover:bg-surface-2"
          @click="router.push(`/bos/groups/${group.id}`)"
        >
          <td class="pl-3" @click.stop><input type="checkbox" class="h-4 w-4 rounded border-border-strong" :checked="selected.has(group.id)" @change="toggleOne(group.id)" /></td>
          <td class="pr-2">
            <span class="flex items-center gap-3">
              <!-- Rasm «Группы»: a smart group's icon carries a gear -->
              <span class="relative flex h-6 w-6 shrink-0 items-center justify-center text-ink-muted" :title="group.type === 'DYNAMIC' ? t('groups.smart') : ''">
                <Icon name="users" size="18" />
                <Icon v-if="group.type === 'DYNAMIC'" name="settings" size="10" class="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface" />
              </span>
              <span class="min-w-0">
                <span class="block truncate text-ink">{{ group.name }}</span>
                <span v-if="group.description" class="block truncate text-caption text-ink-muted">{{ group.description }}</span>
              </span>
            </span>
          </td>
          <td class="px-2 text-ink">{{ group.courseCount }}</td>
          <td class="pr-3 text-ink">{{ group.memberCount }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Rasm «Новая смарт-группа»: a name, and the rule as tick boxes -->
    <Modal v-model="showSmart" :title="t('groups.newSmartGroup')" :description="t('groups.smartHint')" size="lg">
      <form id="create-smart-group" class="space-y-5" @submit.prevent="onCreateSmart">
        <AppInput v-model="smartForm.name" :label="t('groups.fields.name')" required />
        <AppInput v-model="smartForm.description" :label="t('groups.fields.description')" />
        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <p class="mb-2 text-small font-medium text-ink">{{ t('groups.rule.roles') }}</p>
            <label v-for="role in roleOptions" :key="role" class="flex cursor-pointer items-center gap-2 py-1 text-small text-ink">
              <input type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" :checked="smartForm.roles.includes(role)" @change="toggleIn(smartForm.roles, role)" />
              {{ roleLabel(role, { t, te }) }}
            </label>
          </div>
          <div>
            <p class="mb-2 text-small font-medium text-ink">{{ t('groups.rule.departments') }}</p>
            <p v-if="!lists.departments.length" class="text-caption text-ink-faint">—</p>
            <div class="max-h-40 overflow-y-auto">
              <label v-for="d in lists.departments" :key="d" class="flex cursor-pointer items-center gap-2 py-1 text-small text-ink">
                <input type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" :checked="smartForm.departments.includes(d)" @change="toggleIn(smartForm.departments, d)" />
                {{ d }}
              </label>
            </div>
          </div>
          <div>
            <p class="mb-2 text-small font-medium text-ink">{{ t('groups.rule.branches') }}</p>
            <p v-if="!lists.branches.length" class="text-caption text-ink-faint">—</p>
            <div class="max-h-40 overflow-y-auto">
              <label v-for="b in lists.branches" :key="b" class="flex cursor-pointer items-center gap-2 py-1 text-small text-ink">
                <input type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" :checked="smartForm.branches.includes(b)" @change="toggleIn(smartForm.branches, b)" />
                {{ b }}
              </label>
            </div>
          </div>
          <div>
            <p class="mb-2 text-small font-medium text-ink">{{ t('groups.rule.positions') }}</p>
            <p v-if="!lists.positions.length" class="text-caption text-ink-faint">—</p>
            <div class="max-h-40 overflow-y-auto">
              <label v-for="p in lists.positions" :key="p" class="flex cursor-pointer items-center gap-2 py-1 text-small text-ink">
                <input type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" :checked="smartForm.positions.includes(p)" @change="toggleIn(smartForm.positions, p)" />
                {{ p }}
              </label>
            </div>
          </div>
        </div>
        <p class="text-caption text-ink-faint">{{ t('groups.rule.hint') }}</p>
        <p v-if="createError" class="text-small text-danger">{{ createError }}</p>
      </form>
      <template #footer>
        <AppButton variant="ghost" @click="showSmart = false">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" form="create-smart-group" :loading="creating" :disabled="!smartForm.name || smartRuleEmpty">{{ t('groups.create') }}</AppButton>
      </template>
    </Modal>

    <Modal v-model="showCreate" :title="t('groups.newGroup')" :description="t('groups.newGroupHint')">
      <form id="create-group" class="space-y-4" @submit.prevent="onCreate">
        <AppInput v-model="createForm.name" :label="t('groups.fields.name')" required />
        <AppInput v-model="createForm.description" :label="t('groups.fields.description')" />
        <AppInput v-model="createForm.department" :label="t('groups.fields.department')" :hint="t('groups.fields.departmentHint')" />
        <p v-if="createError" class="text-small text-danger">{{ createError }}</p>
      </form>
      <template #footer>
        <AppButton variant="ghost" @click="showCreate = false">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" form="create-group" :loading="creating" :disabled="!createForm.name">
          {{ t('groups.create') }}
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
