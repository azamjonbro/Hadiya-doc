<script setup>
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'

const props = defineProps({
  user: { type: Object, required: true },
})

const emit = defineEmits(['updated', 'deactivated'])

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToast()

const roleOptions = Object.values(ROLES).map((role) => ({ value: role, label: role }))
const canEdit = auth.hasPermission('user:update')

const saving = ref(false)
const deactivating = ref(false)
const errorMessage = ref('')

const form = reactive({
  fullName: '',
  phone: '',
  department: '',
  position: '',
  roleName: '',
  isActive: true,
  password: '',
  avatar: '',
})

function resetFrom(user) {
  form.fullName = user.fullName ?? ''
  form.phone = user.phone ?? ''
  form.department = user.department ?? ''
  form.position = user.position ?? ''
  form.roleName = user.role ?? ''
  form.isActive = user.isActive
  form.avatar = user.avatar ?? ''
  form.password = ''
}

// Keyed on id, not on the object identity — the parent replaces `user` after
// every save, and re-seeding on that would wipe fields typed since.
watch(() => props.user.id, () => resetFrom(props.user), { immediate: true })

async function onSave() {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = { ...form }
    if (!payload.password) delete payload.password
    const updated = await usersApi.update(props.user.id, payload)
    form.password = ''
    emit('updated', updated)
    toast.success(t('users.save'))
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}

async function onDeactivate() {
  deactivating.value = true
  errorMessage.value = ''
  try {
    await usersApi.deactivate(props.user.id)
    emit('deactivated')
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    deactivating.value = false
  }
}
</script>

<template>
  <AppCard class="max-w-3xl">
    <h2 class="text-h3 text-ink">{{ t('settings.sections.profile') }}</h2>
    <p class="mt-1 text-small text-ink-muted">{{ t('employee.settings.hint') }}</p>

    <form class="mt-5 grid grid-cols-2 gap-4" @submit.prevent="onSave">
      <div class="col-span-2 max-w-[10rem]">
        <ImageUploadField
          v-model="form.avatar"
          :label="t('users.fields.avatar')"
          aspect="aspect-square"
          :disabled="!canEdit"
        />
      </div>
      <div class="col-span-2">
        <AppInput v-model="form.fullName" :label="t('users.fields.fullName')" :disabled="!canEdit" />
      </div>
      <AppInput v-model="form.phone" :label="t('users.fields.phone')" :disabled="!canEdit" />
      <AppInput v-model="form.department" :label="t('users.fields.department')" :disabled="!canEdit" />
      <AppInput v-model="form.position" :label="t('users.fields.position')" :disabled="!canEdit" />
      <AppSelect v-model="form.roleName" :label="t('users.role')" :options="roleOptions" :disabled="!canEdit" />
      <label class="col-span-2 flex items-center gap-2 text-small font-medium text-ink">
        <input v-model="form.isActive" type="checkbox" :disabled="!canEdit" class="h-4 w-4 rounded border-border-strong text-primary" />
        {{ t('users.filters.active') }}
      </label>
      <div class="col-span-2">
        <AppInput
          v-model="form.password"
          type="password"
          :label="t('users.fields.newPassword')"
          :hint="t('users.fields.newPasswordHint')"
          :disabled="!canEdit"
        />
      </div>

      <p v-if="errorMessage" class="col-span-2 text-small text-danger">{{ errorMessage }}</p>

      <div v-if="canEdit" class="col-span-2 flex gap-3 pt-2">
        <AppButton type="submit" :loading="saving">{{ saving ? t('users.saving') : t('users.save') }}</AppButton>
        <AppButton
          v-if="auth.hasPermission('user:delete')"
          type="button"
          variant="danger"
          :loading="deactivating"
          @click="onDeactivate"
        >
          {{ deactivating ? t('users.deactivating') : t('users.deactivate') }}
        </AppButton>
      </div>
    </form>
  </AppCard>
</template>
