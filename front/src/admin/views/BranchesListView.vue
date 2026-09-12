<script setup>
/**
 * The org chart as the reference draws it (rasm «Подразделения»): one
 * table, the company at the root, branches under it, then the departments
 * people in that branch sit in, then subdivisions — each row with its
 * code, its head and its headcount, a chevron to fold it, and a ⋯ that
 * creates a unit inside, lists its people, edits or deletes it.
 *
 * Branches are their own collection; departments and subdivisions are the
 * org lists employees are tagged with, so the tree's shape comes from the
 * people and the rows only add a code and a head.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ORG_LIST_TYPES } from '@lms/shared'
import { branchesApi } from '@/services/branches'
import { orgListsApi } from '@/services/orgLists'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import UserPicker from '@/components/ui/UserPicker.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import ColumnSettings from '@/components/ui/ColumnSettings.vue'
import { useTableColumns } from '@/composables/useTableColumns'

const { t } = useI18n()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const auth = useAuthStore()

const canEdit = computed(() => auth.hasPermission('user:update'))
const loading = ref(true)
const tree = ref({ total: 0, branches: [], departments: [] })
const open = ref(new Set(['root']))
const menuFor = ref('')

const columns = computed(() => [
  { key: 'name', label: t('branchesPage.tree.name') },
  { key: 'code', label: t('branchesPage.tree.code') },
  { key: 'head', label: t('branchesPage.tree.head') },
  { key: 'users', label: t('branchesPage.tree.users') },
])
const columnSettings = useTableColumns('org-units', columns)
const show = (key) => columnSettings.visible.value.some((c) => c.key === key)

// Rows are flattened for the table with their depth; folding a node hides
// its subtree. The company row's count is everyone active.
const rows = computed(() => {
  const out = []
  const walk = (node, depth, path) => {
    const key = `${path}/${node.kind}:${node.name}`
    out.push({ ...node, key, depth, hasChildren: node.children.length > 0 })
    if (node.children.length && open.value.has(key)) node.children.forEach((child) => walk(child, depth + 1, key))
  }
  const companyOpen = open.value.has('root')
  out.push({ kind: 'company', key: 'root', name: t('portal.brand'), code: '', headName: '', users: tree.value.total, depth: 0, hasChildren: true })
  if (companyOpen) {
    tree.value.branches.forEach((b) => walk(b, 1, 'root'))
    tree.value.departments.forEach((d) => walk(d, 1, 'root'))
  }
  return out
})

function toggle(row) {
  if (!row.hasChildren) return
  const next = new Set(open.value)
  next.has(row.key) ? next.delete(row.key) : next.add(row.key)
  open.value = next
}

async function load() {
  loading.value = true
  try {
    tree.value = await branchesApi.tree()
  } catch (error) {
    toast.error(apiErrorText(error, t('branchesPage.errorTitle')))
  } finally {
    loading.value = false
  }
}

/* ---------------- editor ---------------- */
const modalOpen = ref(false)
const saving = ref(false)
const dialog = reactive({ mode: 'create', kind: 'branch', id: '', name: '', code: '', headId: '', headName: '', parent: null })
const kindOptions = computed(() =>
  ['branch', 'department', 'subdivision'].map((value) => ({ value, label: t(`branchesPage.tree.kind.${value}`) }))
)
const iconOf = { company: 'building', branch: 'building', department: 'users', subdivision: 'users' }

function openCreate(parent = null) {
  menuFor.value = ''
  Object.assign(dialog, {
    mode: 'create',
    kind: parent?.kind === 'branch' ? 'department' : parent?.kind === 'department' ? 'subdivision' : 'branch',
    id: '',
    name: '',
    code: '',
    headId: '',
    headName: '',
    parent,
  })
  modalOpen.value = true
}
function openEdit(row) {
  menuFor.value = ''
  Object.assign(dialog, { mode: 'edit', kind: row.kind, id: row.id, name: row.name, code: row.code ?? '', headId: row.headId ?? '', headName: row.headName ?? '', parent: null })
  modalOpen.value = true
}

const listType = (kind) => (kind === 'department' ? ORG_LIST_TYPES.DEPARTMENT : ORG_LIST_TYPES.SUBDIVISION)

async function save() {
  const name = dialog.name.trim()
  if (!name) return
  saving.value = true
  try {
    const extra = { code: dialog.code.trim(), headId: dialog.headId || null }
    if (dialog.kind === 'branch') {
      if (dialog.mode === 'edit' && dialog.id) await branchesApi.update(dialog.id, { name, ...extra })
      else await branchesApi.create(name, extra)
    } else if (dialog.mode === 'edit' && dialog.id) {
      await orgListsApi.update(listType(dialog.kind), dialog.id, { name, ...extra })
    } else {
      await orgListsApi.create(listType(dialog.kind), name, extra)
    }
    modalOpen.value = false
    toast.success(t('branchesPage.tree.saved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  menuFor.value = ''
  const ok = await confirm.ask({ title: t('branchesPage.tree.deleteTitle'), message: t('branchesPage.tree.deleteMessage', { name: row.name }) })
  if (!ok) return
  try {
    if (row.kind === 'branch') {
      if (row.id) await branchesApi.remove(row.id)
      else await branchesApi.removeByName(row.name)
    } else {
      if (!row.id) throw new Error(t('branchesPage.tree.inUse'))
      await orgListsApi.remove(listType(row.kind), row.id)
    }
    toast.success(t('branchesPage.deleted', { name: row.name }))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('branchesPage.tree.inUse')))
  }
}

function viewUsers(row) {
  menuFor.value = ''
  const query = {}
  if (row.kind === 'branch') query.branch = row.name
  if (row.kind === 'department') query.department = row.name
  if (row.kind === 'subdivision') query.subdivision = row.name
  router.push({ path: '/bos/users', query })
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('branchesPage.tree.title') }}</h1>
        <p class="mt-1 text-[13px] text-ink-muted">{{ t('branchesPage.tree.subtitle') }}</p>
      </div>
      <div v-if="canEdit" class="flex items-center gap-2">
        <AppButton variant="outline" icon="upload" @click="router.push({ path: '/bos/users', query: { import: '1' } })">{{ t('branchesPage.tree.import') }}</AppButton>
        <AppButton icon="building" @click="openCreate(null)">{{ t('branchesPage.tree.newUnit') }}</AppButton>
      </div>
    </div>

    <div v-if="loading" class="mt-6 space-y-2"><Skeleton v-for="i in 6" :key="i" class="h-12 w-full" /></div>

    <div v-else class="mt-6 overflow-x-auto">
      <table class="w-full min-w-[820px] text-[14px]">
        <thead>
          <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
            <th v-if="show('name')" class="px-3 font-medium">{{ t('branchesPage.tree.name') }}</th>
            <th v-if="show('code')" class="w-36 px-3 font-medium">{{ t('branchesPage.tree.code') }}</th>
            <th v-if="show('head')" class="w-60 px-3 font-medium">{{ t('branchesPage.tree.head') }}</th>
            <th v-if="show('users')" class="w-36 px-3 font-medium">{{ t('branchesPage.tree.users') }}</th>
            <th class="w-14 px-3 text-right"><ColumnSettings :columns="columnSettings" /></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" class="group/row h-14 border-b border-border transition-default hover:bg-surface-2" :class="menuFor === row.key ? 'bg-surface-2' : ''">
            <td v-if="show('name')" class="px-3">
              <div class="flex items-center gap-2" :style="{ paddingLeft: `${row.depth * 24}px` }">
                <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-faint hover:text-ink" :class="row.hasChildren ? '' : 'invisible'" :aria-label="row.name" @click="toggle(row)">
                  <Icon :name="open.has(row.key) ? 'chevron-down' : 'chevron-right'" size="14" />
                </button>
                <Icon :name="iconOf[row.kind]" size="18" class="shrink-0 text-ink-faint" />
                <span class="truncate text-ink">{{ row.name }}</span>
              </div>
            </td>
            <td v-if="show('code')" class="px-3 text-ink">{{ row.code || (row.kind === 'company' ? '0' : '—') }}</td>
            <td v-if="show('head')" class="px-3 text-ink">{{ row.headName || '—' }}</td>
            <td v-if="show('users')" class="px-3 text-ink">{{ row.users || '—' }}</td>
            <td class="relative px-3 text-right">
              <button
                v-if="canEdit && row.kind !== 'company'"
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-default"
                :class="menuFor === row.key ? 'border-primary bg-primary-subtle text-primary opacity-100' : 'border-transparent text-ink-muted opacity-0 hover:border-border-strong hover:bg-surface group-hover/row:opacity-100 focus:opacity-100'"
                :aria-label="t('users.actions.more')"
                @click="menuFor = menuFor === row.key ? '' : row.key"
              >
                <Icon name="more-horizontal" size="18" />
              </button>
              <button v-else-if="canEdit" type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted opacity-0 transition-default hover:bg-surface group-hover/row:opacity-100" :aria-label="t('branchesPage.tree.newUnit')" @click="openCreate(null)"><Icon name="plus" size="16" /></button>
              <div v-if="menuFor === row.key" class="absolute right-3 top-12 z-20 w-64 rounded-xl border border-border bg-surface p-1.5 text-left text-[14px] shadow-lg">
                <button v-if="row.kind !== 'subdivision'" type="button" class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-ink hover:bg-surface-2" @click="openCreate(row)"><Icon name="plus" size="15" class="text-ink-faint" /> {{ t('branchesPage.tree.createChild') }}</button>
                <button type="button" class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-ink hover:bg-surface-2" @click="viewUsers(row)"><Icon name="eye" size="15" class="text-ink-faint" /> {{ t('branchesPage.tree.viewUsers') }}</button>
                <button type="button" class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-ink hover:bg-surface-2" @click="openEdit(row)"><Icon name="pencil" size="15" class="text-ink-faint" /> {{ t('branchesPage.tree.edit') }}</button>
                <button type="button" class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-danger hover:bg-surface-2" @click="remove(row)"><Icon name="trash" size="15" /> {{ t('common.delete') }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-model="modalOpen" size="md" :title="dialog.mode === 'edit' ? t('branchesPage.tree.edit') : t('branchesPage.tree.newUnit')">
      <div class="space-y-4">
        <p v-if="dialog.parent" class="text-caption text-ink-muted">{{ t(`branchesPage.tree.kind.${dialog.parent.kind}`) }}: <span class="text-ink">{{ dialog.parent.name }}</span></p>
        <AppSelect v-if="dialog.mode === 'create'" v-model="dialog.kind" :label="t('branchesPage.tree.kind.company')" :options="kindOptions" />
        <AppInput v-model="dialog.name" :label="t('branchesPage.tree.name')" required />
        <AppInput v-model="dialog.code" :label="t('branchesPage.tree.code')" />
        <UserPicker
          :model-value="dialog.headId"
          :display-name="dialog.headName"
          :label="t('branchesPage.tree.head')"
          :placeholder="t('branchesPage.tree.headPlaceholder')"
          @select="(u) => { dialog.headId = u.id; dialog.headName = u.fullName }"
          @clear="dialog.headId = ''"
        />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" :disabled="!dialog.name.trim()" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
