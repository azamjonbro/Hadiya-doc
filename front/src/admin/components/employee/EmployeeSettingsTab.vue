<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { ROLES, isJshshir, isPassportSeries, normalizeJshshir, normalizePassportSeries } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import BranchSelect from '@/components/ui/BranchSelect.vue'
import GeneratedPasswordField from '@/components/ui/GeneratedPasswordField.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import FaceEnrollmentWizard from '@/components/face/FaceEnrollmentWizard.vue'
import { faceApi } from '@/services/face'

const props = defineProps({
  user: { type: Object, required: true },
})

const emit = defineEmits(['updated', 'deactivated'])

const { t } = useI18n()
const confirm = useConfirm()
const auth = useAuthStore()
const toast = useToast()

const roleOptions = Object.values(ROLES).map((role) => ({ value: role, label: role }))
const canEdit = auth.hasPermission('user:update')

const saving = ref(false)
const deactivating = ref(false)
const errorMessage = ref('')

// Same list the users table filters by, so an admin moving someone between
// offices picks an existing branch instead of coining a near-duplicate.
const branchOptions = ref([])
usersApi
  .branches()
  .then((names) => {
    branchOptions.value = names
  })
  .catch(() => {
    branchOptions.value = []
  })

const form = reactive({
  fullName: '',
  jshshir: '',
  passportSeries: '',
  email: '',
  phone: '',
  branch: '',
  department: '',
  position: '',
  roleName: '',
  isActive: true,
  password: '',
  avatar: '',
})

// Editable here, not just at creation: the JSHSHIR migration gave every
// pre-existing account a placeholder starting with `9`, and this tab is where
// an admin replaces it with the employee's real number.
const jshshirError = computed(() => (form.jshshir && !isJshshir(form.jshshir) ? t('users.fields.jshshirInvalid') : ''))
const passportSeriesError = computed(() =>
  form.passportSeries && !isPassportSeries(form.passportSeries) ? t('users.fields.passportSeriesInvalid') : ''
)

function resetFrom(user) {
  form.fullName = user.fullName ?? ''
  form.jshshir = user.jshshir ?? ''
  form.passportSeries = user.passportSeries ?? ''
  form.email = user.email ?? ''
  form.phone = user.phone ?? ''
  form.branch = user.branch ?? ''
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
  if (jshshirError.value || passportSeriesError.value) return

  saving.value = true
  errorMessage.value = ''
  try {
    const payload = {
      ...form,
      jshshir: normalizeJshshir(form.jshshir),
      passportSeries: normalizePassportSeries(form.passportSeries),
    }
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
  if (!(await confirm.ask({ message: t('confirm.deactivateUser', { name: props.user.fullName }) }))) return
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

// Face verification is entirely SUPERADMIN-managed (spec §16) — ADMIN/
// MANAGER get no new privilege here, matching the backend's requireRole
// gate on every /auth/face admin endpoint.
const faceStatus = ref(null)
const faceStatusLoading = ref(true)
const showFaceWizard = ref(false)
const faceEnableSaving = ref(false)
const faceActionError = ref('')

async function loadFaceStatus() {
  if (!auth.isSuperAdmin) return
  faceStatusLoading.value = true
  try {
    faceStatus.value = await faceApi.status(props.user.id)
  } catch {
    faceStatus.value = null
  } finally {
    faceStatusLoading.value = false
  }
}

watch(() => props.user.id, loadFaceStatus, { immediate: true })

async function onToggleFaceEnabled() {
  if (!faceStatus.value) return
  faceEnableSaving.value = true
  faceActionError.value = ''
  try {
    const result = await faceApi.setEnabled(props.user.id, !faceStatus.value.enabled)
    faceStatus.value.enabled = result.enabled
    toast.success(t('faceVerification.status.saved'))
  } catch (error) {
    faceActionError.value = error.response?.data?.message ?? String(error)
  } finally {
    faceEnableSaving.value = false
  }
}

function onFaceEnrolled() {
  showFaceWizard.value = false
  loadFaceStatus()
}
</script>

<template>
  <AppCard class="max-w-3xl">
    <h2 class="text-h3 text-ink">{{ t('settings.sections.profile') }}</h2>
    <p class="mt-1 text-small text-ink-muted">{{ t('employee.settings.hint') }}</p>

    <form class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onSave">
      <div class="sm:col-span-2 max-w-[10rem]">
        <ImageUploadField
          v-model="form.avatar"
          :label="t('users.fields.avatar')"
          aspect="aspect-square"
          :disabled="!canEdit"
        />
      </div>
      <div class="sm:col-span-2">
        <AppInput v-model="form.fullName" :label="t('users.fields.fullName')" :disabled="!canEdit" />
      </div>
      <AppInput
        v-model="form.jshshir"
        :label="t('users.fields.jshshir')"
        :hint="t('users.fields.jshshirHint')"
        :error="jshshirError"
        :disabled="!canEdit"
      />
      <AppInput
        v-model="form.passportSeries"
        :label="t('users.fields.passportSeries')"
        :hint="t('users.fields.passportSeriesHint')"
        :error="passportSeriesError"
        :disabled="!canEdit"
      />
      <AppInput v-model="form.email" type="email" :label="t('users.fields.emailOptional')" :disabled="!canEdit" />
      <AppInput v-model="form.phone" :label="t('users.fields.phone')" :disabled="!canEdit" />
      <BranchSelect
        v-model="form.branch"
        :options="branchOptions"
        allow-create
        :label="t('users.fields.branch')"
        :disabled="!canEdit"
      />
      <AppInput v-model="form.department" :label="t('users.fields.department')" :disabled="!canEdit" />
      <AppInput v-model="form.position" :label="t('users.fields.position')" :disabled="!canEdit" />
      <AppSelect v-model="form.roleName" :label="t('users.role')" :options="roleOptions" :disabled="!canEdit" />
      <label class="sm:col-span-2 flex items-center gap-2 text-small font-medium text-ink">
        <input v-model="form.isActive" type="checkbox" :disabled="!canEdit" class="h-4 w-4 rounded border-border-strong text-primary" />
        {{ t('users.filters.active') }}
      </label>
      <div class="sm:col-span-2">
        <GeneratedPasswordField v-model="form.password" :label="t('users.fields.newPassword')" :disabled="!canEdit" />
      </div>

      <p v-if="errorMessage" class="sm:col-span-2 text-small text-danger">{{ errorMessage }}</p>

      <div v-if="canEdit" class="sm:col-span-2 flex gap-3 pt-2">
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

  <AppCard v-if="auth.isSuperAdmin" class="mt-6 max-w-3xl">
    <h2 class="text-h3 text-ink">{{ t('faceVerification.status.title') }}</h2>
    <p class="mt-1 text-small text-ink-muted">{{ t('faceVerification.status.hint') }}</p>

    <div v-if="faceStatusLoading" class="mt-4 text-small text-ink-faint">{{ t('common.loading') }}</div>
    <div v-else class="mt-4 space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <Badge v-if="faceStatus?.enrolled" variant="success">{{ t('faceVerification.status.enrolled') }}</Badge>
        <Badge v-else variant="neutral">{{ t('faceVerification.status.notEnrolled') }}</Badge>
        <Badge v-if="faceStatus?.enrolled && !faceStatus?.enabled" variant="warning">
          {{ t('faceVerification.status.disabled') }}
        </Badge>
      </div>

      <p v-if="faceStatus?.enrolledAt" class="text-small text-ink-muted">
        {{ t('faceVerification.status.enrolledAt', { date: new Date(faceStatus.enrolledAt).toLocaleString() }) }}
      </p>
      <p v-if="faceStatus?.lastVerifiedAt" class="text-small text-ink-muted">
        {{ t('faceVerification.status.lastVerifiedAt', { date: new Date(faceStatus.lastVerifiedAt).toLocaleString() }) }}
      </p>

      <p v-if="faceActionError" class="text-small text-danger">{{ faceActionError }}</p>

      <div class="flex flex-wrap gap-3 pt-1">
        <AppButton type="button" variant="secondary" @click="showFaceWizard = true">
          {{ faceStatus?.enrolled ? t('faceVerification.status.reEnroll') : t('faceVerification.status.enroll') }}
        </AppButton>
        <AppButton
          v-if="faceStatus?.enrolled"
          type="button"
          variant="outline"
          :loading="faceEnableSaving"
          @click="onToggleFaceEnabled"
        >
          {{ faceStatus.enabled ? t('faceVerification.status.disable') : t('faceVerification.status.enable') }}
        </AppButton>
      </div>
    </div>
  </AppCard>

  <FaceEnrollmentWizard
    v-if="showFaceWizard"
    :model-value="showFaceWizard"
    :user-id="props.user.id"
    :user-name="props.user.fullName"
    :mode="faceStatus?.enrolled ? 're-enroll' : 'enroll'"
    @update:model-value="showFaceWizard = false"
    @enrolled="onFaceEnrolled"
  />
</template>
