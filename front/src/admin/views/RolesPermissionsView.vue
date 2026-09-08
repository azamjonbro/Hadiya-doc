<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
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
    message: t('roles.confirmDelete', { name: role.name }),
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
  <div class="px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('roles.title') }}</h1>
    <p class="mt-1 max-w-2xl text-small text-ink-muted">{{ t('roles.hint') }}</p>

    <AppCard class="mt-6">
      <h2 class="text-small font-semibold text-ink">{{ t('roles.newRole') }}</h2>
      <div class="mt-3 flex flex-wrap items-end gap-3">
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
        <AppButton :disabled="creating || !newRoleName.trim()" @click="createRole">
          {{ t('roles.create') }}
        </AppButton>
      </div>
      <!-- Said here rather than discovered after saving: a new role starts
           with nothing but the baseline, and its scope is the narrowest. -->
      <p class="mt-2 text-caption text-ink-faint">{{ t('roles.newRoleHint') }}</p>
    </AppCard>

    <Skeleton v-if="loading" class="mt-6 h-64 w-full" />

    <div
      v-else-if="failed"
      class="mt-6 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3"
    >
      <span class="text-small text-ink-muted">{{ t('roles.loadFailed') }}</span>
      <AppButton size="sm" variant="ghost" @click="load">{{ t('common.retry') }}</AppButton>
    </div>

    <div v-else class="mt-6 space-y-4">
      <AppCard v-for="role in roles" :key="role.id">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-body font-semibold text-ink">{{ role.name }}</h2>
              <!-- Locked rather than hidden. Someone wondering why they
                   cannot edit SUPERADMIN deserves the answer next to it. -->
              <Badge v-if="role.isSystem" variant="neutral">
                <Icon name="lock" class="mr-1 inline h-3 w-3 align-text-bottom" />
                {{ t('roles.builtIn') }}
              </Badge>
              <Badge variant="info">{{ t(`roles.scopes.${role.scope}`) }}</Badge>
            </div>
            <p class="mt-1 text-caption text-ink-muted">
              {{ t('roles.userCount', { count: role.users }) }} ·
              {{ t('roles.permissionCount', { count: (role.permissions ?? []).length }) }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <template v-if="draft?.id === role.id">
              <AppButton size="sm" variant="ghost" @click="cancelEditing">{{ t('common.cancel') }}</AppButton>
              <AppButton size="sm" :disabled="savingRoleId === role.id" @click="save">
                {{ t('common.save') }}
              </AppButton>
            </template>
            <template v-else-if="!role.isSystem">
              <AppButton size="sm" variant="ghost" @click="startEditing(role)">{{ t('common.edit') }}</AppButton>
              <AppButton size="sm" variant="ghost" :disabled="role.users > 0" @click="removeRole(role)">
                {{ t('common.delete') }}
              </AppButton>
            </template>
          </div>
        </div>

        <div v-if="draft?.id === role.id" class="mt-4 border-t border-border pt-4">
          <div class="max-w-xs">
            <label class="mb-1 block text-caption text-ink-muted">{{ t('roles.scope') }}</label>
            <AppSelect v-model="draft.scope" :options="scopeOptions" />
            <p class="mt-1 text-caption text-ink-faint">{{ t(`roles.scopeHints.${draft.scope}`) }}</p>
          </div>

          <div class="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="group in catalogue" :key="group.module">
              <button
                type="button"
                class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-muted transition-default hover:text-ink"
                @click="toggleModule(group)"
              >
                {{ group.module }}
              </button>
              <label
                v-for="permission in group.permissions"
                :key="permission.key"
                class="flex cursor-pointer items-start gap-2 py-1"
              >
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                  :checked="draft.permissions.has(permission.key)"
                  @change="toggle(permission.key)"
                />
                <span class="text-small text-ink">{{ permission.key }}</span>
              </label>
            </div>
          </div>

          <p class="mt-4 text-caption text-ink-faint">
            {{ t('roles.selectedCount', { count: draft.permissions.size, total: allPermissionKeys.length }) }}
          </p>
        </div>
      </AppCard>
    </div>
  </div>
</template>
