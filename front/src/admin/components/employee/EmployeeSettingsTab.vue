<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { normalizeJshshir } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { useOrgDirectory } from '@/composables/useOrgDirectory'
import { formatDateTime, toDateInputValue } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import EmployeeFormFields from './EmployeeFormFields.vue'
import Icon from '@/components/ui/Icon.vue'
import GeneratedPasswordField from '@/components/ui/GeneratedPasswordField.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import FaceEnrollmentWizard from '@/components/face/FaceEnrollmentWizard.vue'
import { faceApi } from '@/services/face'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({
  user: { type: Object, required: true },
})

const emit = defineEmits(['updated', 'deactivated', 'deleted'])

const { t, locale } = useI18n()
const confirm = useConfirm()
const auth = useAuthStore()
const toast = useToast()

// Roles and the four org lists, from the server — same source the employee
// form and the list filters read, so a title added while editing one person is
// there for the next.
const directory = useOrgDirectory()
directory.loadAll()
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
  firstName: '',
  lastName: '',
  patronymic: '',
  jshshir: '',
  managerId: '',
  managerName: '',
  email: '',
  phone: '',
  branch: '',
  department: '',
  subdivision: '',
  position: '',
  country: '',
  address: '',
  gender: '',
  birthDate: '',
  hireDate: '',
  terminationDate: '',
  roleName: '',
  isActive: true,
  password: '',
  avatar: '',
})

// Raised by the shared field block — the identity fields are editable here and
// not only at creation, because the JSHSHIR migration gave every pre-existing
// account a placeholder starting with `9` and this tab is where an admin
// replaces it with the real number.
const fieldsValid = ref(true)

function resetFrom(user) {
  form.firstName = user.firstName ?? ''
  form.lastName = user.lastName ?? ''
  form.patronymic = user.patronymic ?? ''
  form.jshshir = user.jshshir ?? ''
  form.managerId = user.managerId ?? ''
  form.managerName = user.managerName ?? ''
  form.email = user.email ?? ''
  form.phone = user.phone ?? ''
  form.branch = user.branch ?? ''
  form.department = user.department ?? ''
  form.subdivision = user.subdivision ?? ''
  form.position = user.position ?? ''
  form.country = user.country ?? ''
  form.address = user.address ?? ''
  form.gender = user.gender ?? ''
  form.birthDate = toDateInputValue(user.birthDate)
  form.hireDate = toDateInputValue(user.hireDate)
  form.terminationDate = toDateInputValue(user.terminationDate)
  form.roleName = user.role ?? ''
  form.isActive = user.isActive
  form.avatar = user.avatar ?? ''
  form.password = ''
}

// Keyed on id, not on the object identity — the parent replaces `user` after
// every save, and re-seeding on that would wipe fields typed since.
watch(() => props.user.id, () => resetFrom(props.user), { immediate: true })

async function onSave() {
  if (!fieldsValid.value) return

  saving.value = true
  errorMessage.value = ''
  try {
    const { managerName: _name, ...rest } = form
    const payload = { ...rest, jshshir: normalizeJshshir(form.jshshir) }
    if (!payload.password) delete payload.password
    const updated = await usersApi.update(props.user.id, payload)
    form.password = ''
    emit('updated', updated)
    toast.success(t('users.save'))
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    saving.value = false
  }
}

// The cards on the right: status, password, delete. Each opens in place —
// the reference shows a "Change" link, not a second form.
const passwordOpen = ref(false)
const deleting = ref(false)
const canDelete = computed(() => auth.hasPermission('user:delete'))
const lastLogin = computed(() => (props.user.lastLoginAt ? formatDateTime(props.user.lastLoginAt, locale.value) : ''))

async function onToggleActive() {
  if (!canEdit) return
  saving.value = true
  errorMessage.value = ''
  try {
    const updated = await usersApi.update(props.user.id, { isActive: !props.user.isActive })
    form.isActive = updated.isActive
    emit('updated', updated)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    saving.value = false
  }
}

async function onDeletePermanently() {
  const ok = await confirm.ask({
    title: t('employee.delete.title'),
    message: t('employee.delete.message', { name: props.user.fullName }),
    confirmLabel: t('employee.delete.confirm'),
    danger: true,
  })
  if (!ok) return
  deleting.value = true
  errorMessage.value = ''
  try {
    await usersApi.deletePermanently(props.user.id)
    toast.success(t('employee.delete.done'))
    emit('deleted')
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    deleting.value = false
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
    errorMessage.value = apiErrorText(error)
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
    faceActionError.value = apiErrorText(error)
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
  <!-- The reference (rasm): the form on the left, three cards on the right —
       status, password, delete — and Save at the top of the card. -->
  <div>
    <div class="flex items-center justify-between gap-4 border-b border-border pb-4">
      <p class="text-[15px] text-ink">{{ t('employee.settings.hint') }}</p>
      <AppButton v-if="canEdit" type="button" :loading="saving" @click="onSave">{{ saving ? t('users.saving') : t('common.save') }}</AppButton>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,640px)_minmax(280px,360px)]">
      <form class="min-w-0" @submit.prevent="onSave">
        <EmployeeFormFields
          :form="form"
          :directory="directory"
          :branch-options="branchOptions"
          :can-manage-roles="auth.hasPermission('role:manage')"
          :can-manage-lists="canEdit"
          :disabled="!canEdit"
          :self-id="props.user.id"
          @validity="fieldsValid = $event"
        />

        <div class="my-6 border-t border-border sm:max-w-[624px]" />

        <div class="grid grid-cols-1 gap-y-1 sm:grid-cols-[200px_minmax(0,400px)] sm:items-start sm:gap-x-6">
          <span class="text-small text-ink-muted sm:pt-1">{{ t('users.fields.avatar') }}</span>
          <div class="max-w-[10rem]">
            <ImageUploadField v-model="form.avatar" aspect="aspect-square" :disabled="!canEdit" />
          </div>
        </div>

        <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>
        <button type="submit" class="sr-only">{{ t('common.save') }}</button>
      </form>

      <div class="space-y-3">
        <!-- Status -->
        <div class="rounded-xl border border-border p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="flex items-center gap-1.5 text-small font-medium text-ink">
                <Icon :name="props.user.isActive ? 'check-circle' : 'eye-off'" size="15" :class="props.user.isActive ? 'text-success' : 'text-ink-faint'" />
                {{ props.user.isActive ? t('users.filters.active') : t('users.filters.inactive') }}
              </p>
              <p class="mt-1 text-caption text-ink-muted">
                {{ lastLogin ? t('employee.status.lastLogin', { date: lastLogin }) : t('employee.status.neverLoggedIn') }}
              </p>
            </div>
            <button v-if="canEdit" type="button" class="flex shrink-0 items-center gap-1.5 text-small text-ink-muted transition-default hover:text-ink" :disabled="saving" @click="onToggleActive">
              <Icon name="pencil" size="14" /> {{ props.user.isActive ? t('employee.status.block') : t('employee.status.unblock') }}
            </button>
          </div>
        </div>

        <!-- Password -->
        <div class="rounded-xl border border-border p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-small font-medium text-ink">{{ t('employee.password.title') }}</p>
              <p class="mt-1 text-caption text-ink-muted">{{ t('employee.password.hint') }}</p>
            </div>
            <button v-if="canEdit" type="button" class="flex shrink-0 items-center gap-1.5 text-small text-ink-muted transition-default hover:text-ink" @click="passwordOpen = !passwordOpen">
              <Icon name="pencil" size="14" /> {{ t('common.edit') }}
            </button>
          </div>
          <div v-if="passwordOpen" class="mt-3">
            <GeneratedPasswordField v-model="form.password" :aria-label="t('users.fields.newPassword')" :disabled="!canEdit" />
            <p class="mt-2 text-caption text-ink-faint">{{ t('employee.password.saveHint') }}</p>
          </div>
        </div>

        <!-- Delete -->
        <div v-if="canDelete" class="rounded-xl border border-border p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-small font-medium text-ink">{{ t('employee.delete.title') }}</p>
              <p class="mt-1 text-caption text-ink-muted">{{ t('employee.delete.hint') }}</p>
            </div>
            <button
              v-if="auth.isSuperAdmin"
              type="button"
              class="flex shrink-0 items-center gap-1.5 text-small text-danger transition-default hover:opacity-80 disabled:opacity-50"
              :disabled="deleting"
              @click="onDeletePermanently"
            >
              <Icon name="trash" size="14" /> {{ t('common.delete') }}
            </button>
          </div>
          <button type="button" class="mt-3 text-caption text-ink-muted underline-offset-2 hover:underline" :disabled="deactivating" @click="onDeactivate">
            {{ deactivating ? t('users.deactivating') : t('users.deactivate') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="auth.isSuperAdmin" class="mt-6">
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
  </div>

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
