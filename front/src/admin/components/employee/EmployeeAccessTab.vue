<script setup>
/**
 * "Уровень доступа": the role as a chip, a way to change it, and the list
 * of what that role lets the person do — folded away until asked for.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { rolesApi } from '@/services/roles'
import { usersApi } from '@/services/users'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { roleLabel, permissionLabel, moduleLabel } from '@/utils/roleLabel'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const props = defineProps({
  user: { type: Object, required: true },
})
const emit = defineEmits(['updated'])

const { t, te } = useI18n()
const auth = useAuthStore()
const toast = useToast()

const roles = ref([])
const loading = ref(true)
const draft = ref('')
const editing = ref(false)
const saving = ref(false)
const showPermissions = ref(false)

const canEdit = computed(() => auth.hasPermission('user:update'))
const current = computed(() => roles.value.find((r) => r.name === props.user.role) ?? null)
const roleOptions = computed(() => roles.value.map((r) => ({ value: r.name, label: roleLabel(r.name, { t, te }) })))
const grouped = computed(() => {
  const byModule = new Map()
  for (const key of current.value?.permissions ?? []) {
    const module = key.split(':')[0]
    if (!byModule.has(module)) byModule.set(module, [])
    byModule.get(module).push(key)
  }
  return [...byModule.entries()].map(([module, keys]) => ({ module, keys }))
})

async function load() {
  loading.value = true
  try {
    roles.value = await rolesApi.list()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!draft.value || draft.value === props.user.role) {
    editing.value = false
    return
  }
  saving.value = true
  try {
    const updated = await usersApi.update(props.user.id, { roleName: draft.value })
    emit('updated', updated)
    editing.value = false
    toast.success(t('users.save'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-4 border-b border-border pb-4">
      <p class="text-[15px] text-ink">{{ t('employee.access.hint') }}</p>
      <AppButton v-if="editing" :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-y-2 sm:grid-cols-[200px_minmax(0,560px)] sm:gap-x-6">
      <span class="text-small text-ink-muted sm:pt-1.5"><span class="text-danger">* </span>{{ t('employee.access.role') }}</span>
      <div>
        <Skeleton v-if="loading" class="h-9 w-48" />
        <template v-else-if="editing">
          <AppSelect v-model="draft" :options="roleOptions" :aria-label="t('employee.access.role')" class="max-w-xs" />
        </template>
        <div v-else class="flex flex-wrap items-center gap-3">
          <Badge variant="neutral">{{ roleLabel(user.role, { t, te }) }}</Badge>
          <span v-if="current" class="text-caption text-ink-faint">{{ t('employee.access.scope') }}: {{ t(`roles.scopes.${current.scope}`) }}</span>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-5 text-small">
          <button v-if="canEdit && !editing" type="button" class="flex items-center gap-1.5 text-primary hover:underline" @click="draft = user.role; editing = true">
            <Icon name="pencil" size="14" /> {{ t('common.edit') }}
          </button>
          <button type="button" class="flex items-center gap-1.5 text-ink-muted hover:text-ink" @click="showPermissions = !showPermissions">
            <Icon :name="showPermissions ? 'eye-off' : 'eye'" size="14" />
            {{ showPermissions ? t('employee.access.hidePermissions') : t('employee.access.showPermissions') }}
          </button>
        </div>

        <div v-if="showPermissions && current" class="mt-5 grid gap-5 sm:grid-cols-2">
          <div v-for="group in grouped" :key="group.module">
            <p class="mb-1.5 text-caption font-semibold uppercase tracking-wide text-ink-muted">{{ moduleLabel(group.module, { t, te }) }}</p>
            <ul class="space-y-1">
              <li v-for="key in group.keys" :key="key" class="flex items-center gap-2 text-small text-ink">
                <Icon name="check" size="13" class="shrink-0 text-success" /> {{ permissionLabel(key, { t, te }) }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
