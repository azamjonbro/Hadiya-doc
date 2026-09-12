<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabel, permissionLabel, moduleLabel } from '@/utils/roleLabel'
import { rolesApi } from '@/services/roles'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t, te } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const SCOPES = ['ALL', 'DEPARTMENT', 'TEAM', 'SELF']

const roles = ref([])
const catalogue = ref([])
const loading = ref(true)
const failed = ref(false)
const savingRoleId = ref('')

// The row being edited, as a working copy. Edits are not sent per click:
// the endpoint replaces the whole permission list, and saving on every tick
// would make a half-finished row a real state somebody could be caught in.
const draft = ref(null)

const showCreate = ref(false)
const newRoleName = ref('')
const newRoleScope = ref('SELF')
const creating = ref(false)

const scopeOptions = computed(() =>
  SCOPES.map((scope) => ({ value: scope, label: t(`roles.scopes.${scope}`) }))
)

const allPermissionKeys = computed(() =>
  catalogue.value.flatMap((group) => group.permissions.map((permission) => permission.key))
)

async function load() {
  loading.value = true
  failed.value = false
  try {
    const [roleRows, catalogueRows] = await Promise.all([rolesApi.list(), rolesApi.permissions()])
    roles.value = roleRows
    catalogue.value = catalogueRows
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

function startEditing(role) {
  draft.value = {
    id: role.id,
    name: role.name,
    scope: role.scope,
    permissions: new Set(role.permissions ?? []),
  }
}

function cancelEditing() {
  draft.value = null
}

function toggle(key) {
  if (!draft.value) return
  if (draft.value.permissions.has(key)) draft.value.permissions.delete(key)
  else draft.value.permissions.add(key)
  // A Set mutated in place is not reactive; replacing it is.
  draft.value = { ...draft.value, permissions: new Set(draft.value.permissions) }
}

function toggleModule(group) {
  if (!draft.value) return
  const keys = group.permissions.map((permission) => permission.key)
  const allOn = keys.every((key) => draft.value.permissions.has(key))
  const next = new Set(draft.value.permissions)
  for (const key of keys) {
    if (allOn) next.delete(key)
    else next.add(key)
  }
  draft.value = { ...draft.value, permissions: next }
}

async function save() {
  if (!draft.value) return
  savingRoleId.value = draft.value.id
  try {
    const updated = await rolesApi.update(draft.value.id, {
      permissions: [...draft.value.permissions],
      scope: draft.value.scope,
    })
    roles.value = roles.value.map((role) => (role.id === updated.id ? { ...role, ...updated } : role))
    draft.value = null
    toast.success(t('roles.saved'))
  } catch (error) {
    toast.error(apiErrorText(error, t('roles.saveFailed')))
  } finally {
    savingRoleId.value = ''
  }
}

async function createRole() {
  const name = newRoleName.value.trim()
  if (!name) return
  creating.value = true
  try {
    await rolesApi.create(name, newRoleScope.value)
    newRoleName.value = ''
    newRoleScope.value = 'SELF'
    await load()
    toast.success(t('roles.created'))
  } catch (error) {
    toast.error(apiErrorText(error, t('roles.createFailed')))
  } finally {
    creating.value = false
  }
}

async function removeRole(role) {
  const ok = await confirm({
    title: t('roles.confirmDeleteTitle'),
    message: t('roles.confirmDelete', { name: roleLabel(role.name, { t, te }) }),
    confirmLabel: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await rolesApi.remove(role.id)
    await load()
    toast.success(t('roles.deleted'))
  } catch (error) {
    toast.error(apiErrorText(error, t('roles.deleteFailed')))
  }
}

onMounted(load)
</script>

<template>
  <div class="px-6 py-6 lg:px-8">
    <!-- Rasn 8: title, one line of help, "New role" on the right; then a
         flat table — name (a lock on the built-in ones), description,
         users. A row opens its editor underneath. -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('roles.title') }}</h1>
        <p class="mt-1 max-w-2xl text-[14px] text-ink-muted">{{ t('roles.hint') }}</p>
      </div>
      <AppButton icon="plus" :aria-expanded="showCreate" @click="showCreate = !showCreate">{{ t('roles.newRole') }}</AppButton>
    </div>

    <div v-if="showCreate" class="mt-5 rounded-xl bg-surface-2 p-5">
      <div class="flex flex-wrap items-end gap-3">
        <AppInput
          v-model="newRoleName"
          class="min-w-48 flex-1"
          :label="t('roles.name')"
          :placeholder="t('roles.namePlaceholder')"
          @keyup.enter="createRole"
        />
        <div class="min-w-44">
          <label class="mb-1 block text-caption text-ink-muted">{{ t('roles.scope') }}</label>
          <AppSelect v-model="newRoleScope" :options="scopeOptions" />
        </div>
        <AppButton :disabled="creating || !newRoleName.trim()" @click="createRole">{{ t('roles.create') }}</AppButton>
      </div>
      <!-- Said here rather than discovered after saving: a new role starts
           with nothing but the baseline, and its scope is the narrowest. -->
      <p class="mt-2 text-caption text-ink-faint">{{ t('roles.newRoleHint') }}</p>
    </div>

    <Skeleton v-if="loading" class="mt-6 h-64 w-full" />

    <div v-else-if="failed" class="mt-6 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3">
      <span class="text-small text-ink-muted">{{ t('roles.loadFailed') }}</span>
      <AppButton size="sm" variant="ghost" @click="load">{{ t('common.retry') }}</AppButton>
    </div>

    <table v-else class="mt-6 w-full text-[14px]">
      <thead>
        <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
          <th class="pl-3 pr-2 font-medium text-ink">{{ t('roles.name') }} <Icon name="chevron-up" size="12" class="inline text-ink-faint" /></th>
          <th class="px-2 font-medium">{{ t('roles.scope') }}</th>
          <th class="w-40 px-2 font-medium">{{ t('roles.permissions') }}</th>
          <th class="w-32 pr-3 font-medium">{{ t('users.title') }}</th>
          <th class="w-40 pr-3"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="role in roles" :key="role.id">
          <tr class="h-14 border-b border-border transition-default hover:bg-surface-2" :class="draft?.id === role.id ? 'bg-surface-2' : ''">
            <td class="pl-3 pr-2">
              <span class="flex items-center gap-2 text-ink">
                {{ roleLabel(role.name, { t, te }) }}
                <span v-if="roleLabel(role.name, { t, te }) !== role.name" class="ml-1.5 font-mono text-caption font-normal text-ink-faint">{{ role.name }}</span>
                <!-- Locked rather than hidden. Someone wondering why they
                     cannot edit SUPERADMIN deserves the answer next to it. -->
                <Icon v-if="role.isSystem" name="lock" size="13" class="text-ink-faint" :title="t('roles.builtIn')" />
              </span>
            </td>
            <td class="px-2 text-ink-muted">{{ t(`roles.scopeHints.${role.scope}`) }}</td>
            <td class="px-2 text-ink-muted">{{ (role.permissions ?? []).length }}</td>
            <td class="pr-3 text-ink">{{ role.users }}</td>
            <td class="pr-3 text-right">
              <span class="flex items-center justify-end gap-1">
                <template v-if="draft?.id === role.id">
                  <AppButton size="sm" variant="ghost" @click="cancelEditing">{{ t('common.cancel') }}</AppButton>
                  <AppButton size="sm" :disabled="savingRoleId === role.id" @click="save">{{ t('common.save') }}</AppButton>
                </template>
                <template v-else-if="!role.isSystem">
                  <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="startEditing(role)"><Icon name="pencil" size="15" /></button>
                  <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-danger disabled:opacity-40" :aria-label="t('common.delete')" :disabled="role.users > 0" @click="removeRole(role)"><Icon name="trash" size="15" /></button>
                </template>
              </span>
            </td>
          </tr>
          <tr v-if="draft?.id === role.id" class="border-b border-border">
            <td colspan="5" class="px-3 py-5">
              <div class="max-w-xs">
                <label class="mb-1 block text-caption text-ink-muted">{{ t('roles.scope') }}</label>
                <AppSelect v-model="draft.scope" :options="scopeOptions" />
                <p class="mt-1 text-caption text-ink-faint">{{ t(`roles.scopeHints.${draft.scope}`) }}</p>
              </div>
              <div class="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <div v-for="group in catalogue" :key="group.module">
                  <button type="button" class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-muted transition-default hover:text-ink" @click="toggleModule(group)">
                    {{ moduleLabel(group.module, { t, te }) }}
                  </button>
                  <label v-for="permission in group.permissions" :key="permission.key" class="flex cursor-pointer items-start gap-2 py-1">
                    <input type="checkbox" class="mt-0.5 h-4 w-4 cursor-pointer accent-primary" :checked="draft.permissions.has(permission.key)" @change="toggle(permission.key)" />
                    <span class="text-small text-ink" :title="permission.key">{{ permissionLabel(permission.key, { t, te }) }}</span>
                  </label>
                </div>
              </div>
              <p class="mt-4 text-caption text-ink-faint">
                {{ t('roles.selectedCount', { count: draft.permissions.size, total: allPermissionKeys.length }) }}
              </p>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
