<script setup>
/**
 * "Уровень доступа": the roles as chips — add one, drop one — and the
 * union of what they allow, folded away until asked for (RoleChips).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { rolesApi } from '@/services/roles'
import { usersApi } from '@/services/users'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import RoleChips from './RoleChips.vue'

const props = defineProps({
  user: { type: Object, required: true },
})
const emit = defineEmits(['updated'])

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToast()

const roles = ref([])
const loading = ref(true)
const draft = ref([])
const saving = ref(false)

const canEdit = computed(() => auth.hasPermission('user:update'))
const heldNames = () => (props.user.roles?.length ? [...props.user.roles] : props.user.role ? [props.user.role] : [])
const dirty = computed(() => JSON.stringify([...draft.value].sort()) !== JSON.stringify(heldNames().sort()))
const primary = computed(() => roles.value.find((r) => r.name === props.user.role) ?? null)

watch(() => props.user.id, () => (draft.value = heldNames()), { immediate: true })

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
  if (!dirty.value || !draft.value.length) return
  saving.value = true
  try {
    const updated = await usersApi.update(props.user.id, { roleNames: draft.value })
    emit('updated', updated)
    draft.value = updated.roles?.length ? [...updated.roles] : [updated.role]
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
      <AppButton v-if="canEdit" :disabled="!dirty" :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-y-2 sm:grid-cols-[200px_minmax(0,560px)] sm:gap-x-6">
      <span class="text-small text-ink-muted sm:pt-1.5"><span class="text-danger">* </span>{{ t('employee.access.role') }}</span>
      <div>
        <Skeleton v-if="loading" class="h-8 w-48" />
        <RoleChips v-else v-model="draft" :roles="roles" :disabled="!canEdit" />
        <p v-if="primary && !loading" class="mt-3 text-caption text-ink-faint">{{ t('employee.access.scope') }}: {{ t(`roles.scopes.${primary.scope}`) }}</p>
      </div>
    </div>
  </div>
</template>
