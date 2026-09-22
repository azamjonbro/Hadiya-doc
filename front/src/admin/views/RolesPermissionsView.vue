<script setup>
/**
 * The roles list (rasm «Роли»): the title, one line of help, «New role»
 * on the right, then a flat table — a tick box, the name with a lock on
 * the built-in ones, the description, how many people hold it. A row
 * opens the role's own page (RoleEditorView); the editor used to unfold
 * under the row, and a forty-checkbox grid inside a table cell was the
 * wrong place for it.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { roleLabel } from '@/utils/roleLabel'
import { rolesApi } from '@/services/roles'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t, te } = useI18n()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const roles = ref([])
const loading = ref(true)
const failed = ref(false)
const selected = ref(new Set())
const sortDir = ref('asc')

async function load() {
  loading.value = true
  failed.value = false
  try {
    roles.value = await rolesApi.list()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

// A seeded role's description is translated like its label; a role somebody
// made carries the words they typed.
function describe(role) {
  if (role.description) return role.description
  const key = `roles.descriptions.${role.name}`
  return te(key) ? t(key) : ''
}

const sorted = computed(() =>
  [...roles.value].sort((a, b) => roleLabel(a.name, { t, te }).localeCompare(roleLabel(b.name, { t, te })) * (sortDir.value === 'asc' ? 1 : -1)),
)

const allSelected = computed(() => roles.value.length > 0 && selected.value.size === roles.value.length)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(roles.value.map((r) => r.id))
}
function toggleOne(id) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
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
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('roles.title') }}</h1>
        <p class="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-muted">{{ t('roles.hint') }}</p>
      </div>
      <AppButton icon="user-plus" @click="router.push('/bos/roles/new')">{{ t('roles.newRole') }}</AppButton>
    </div>

    <Skeleton v-if="loading" class="mt-6 h-64 w-full rounded-xl" />

    <div v-else-if="failed" class="mt-6 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3">
      <span class="text-small text-ink-muted">{{ t('roles.loadFailed') }}</span>
      <AppButton size="sm" variant="ghost" @click="load">{{ t('common.retry') }}</AppButton>
    </div>

    <table v-else class="mt-6 w-full text-[14px]">
      <thead>
        <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
          <th class="w-10 pl-3"><input type="checkbox" class="h-4 w-4 rounded border-border-strong" :checked="allSelected" :aria-label="t('common.all')" @change="toggleAll" /></th>
          <th class="pr-2 font-medium text-ink">
            <button type="button" class="inline-flex items-center gap-1 hover:text-ink" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
              {{ t('roles.name') }} <Icon :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" size="12" class="text-ink-faint" />
            </button>
          </th>
          <th class="px-2 font-medium">{{ t('roles.description') }}</th>
          <th class="w-40 px-2 font-medium">{{ t('users.title') }}</th>
          <th class="w-24 pr-3"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="role in sorted"
          :key="role.id"
          class="group h-14 cursor-pointer border-b border-border transition-default last:border-b-0 hover:bg-surface-2"
          @click="router.push(`/bos/roles/${role.id}`)"
        >
          <td class="pl-3" @click.stop><input type="checkbox" class="h-4 w-4 rounded border-border-strong" :checked="selected.has(role.id)" @change="toggleOne(role.id)" /></td>
          <td class="pr-2">
            <span class="flex items-center gap-2 text-ink">
              <span class="truncate">{{ roleLabel(role.name, { t, te }) }}</span>
              <!-- Locked rather than hidden. Someone wondering why they
                   cannot edit SUPERADMIN deserves the answer next to it. -->
              <Icon v-if="role.isSystem" name="lock" size="13" class="shrink-0 text-ink-faint" :title="t('roles.builtIn')" />
            </span>
          </td>
          <td class="max-w-[420px] truncate px-2 text-ink-muted">{{ describe(role) || '—' }}</td>
          <td class="px-2 text-ink">{{ role.users }}</td>
          <td class="pr-3 text-right" @click.stop>
            <button
              v-if="!role.isSystem"
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted opacity-0 transition-default hover:bg-surface-hover hover:text-danger disabled:opacity-40 group-hover:opacity-100 focus-visible:opacity-100"
              :aria-label="t('common.delete')"
              :title="role.users > 0 ? t('roles.deleteInUse') : t('common.delete')"
              :disabled="role.users > 0"
              @click="removeRole(role)"
            >
              <Icon name="trash" size="15" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
