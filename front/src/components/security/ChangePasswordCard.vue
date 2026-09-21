<script setup>
/**
 * Own password, on the profile's security tab.
 *
 * Until this card the only way an employee could get a new password was to
 * ask an admin — the admin's employee page has had the field all along, the
 * person it belongs to had nothing. The current password is asked for even
 * though they are signed in: a laptop left unlocked must not be enough to
 * lock its owner out.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PASSWORD_MIN_LENGTH } from '@lms/shared'
import { securityApi } from '@/services/security'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const auth = useAuthStore()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)
const errorMessage = ref('')

// Checked before the request rather than after: a mismatch or a short
// password is the reader's typo, and the answer belongs next to the field.
const confirmError = computed(() =>
  confirmPassword.value && confirmPassword.value !== newPassword.value ? t('changePassword.mismatch') : ''
)
const lengthError = computed(() =>
  newPassword.value && newPassword.value.length < PASSWORD_MIN_LENGTH
    ? t('changePassword.tooShort', { length: PASSWORD_MIN_LENGTH })
    : ''
)
const canSubmit = computed(
  () =>
    currentPassword.value &&
    newPassword.value &&
    confirmPassword.value === newPassword.value &&
    !lengthError.value &&
    !saving.value
)

async function onSubmit() {
  if (!canSubmit.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const result = await securityApi.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    // The API could not tell which session was this one and ended them
    // all — including this one. Say so and go to the login page, rather
    // than letting the next request fail with a 401 out of nowhere.
    if (result.signedOut) {
      toast.success(t('changePassword.doneSignedOut'))
      await auth.logout()
      router.push({ name: 'login' })
      return
    }
    toast.success(t('changePassword.done'))
  } catch (error) {
    const code = error?.response?.data?.code
    errorMessage.value =
      code === 'CURRENT_PASSWORD_WRONG' ? t('changePassword.currentWrong') : apiErrorText(error, t('changePassword.failed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppCard class="border border-border p-6 shadow-sm">
    <h2 class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('changePassword.title') }}</h2>
    <p class="mt-2 text-small text-ink-muted">{{ t('changePassword.hint') }}</p>

    <form class="mt-4 max-w-sm space-y-3" @submit.prevent="onSubmit">
      <AppInput
        v-model="currentPassword"
        type="password"
        :label="t('changePassword.current')"
        icon="lock"
        autocomplete="current-password"
        required
      />
      <AppInput
        v-model="newPassword"
        type="password"
        :label="t('changePassword.new')"
        icon="lock"
        autocomplete="new-password"
        :error="lengthError"
        :hint="t('changePassword.lengthHint', { length: PASSWORD_MIN_LENGTH })"
        required
      />
      <AppInput
        v-model="confirmPassword"
        type="password"
        :label="t('changePassword.confirm')"
        icon="lock"
        autocomplete="new-password"
        :error="confirmError"
        required
      />

      <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>

      <AppButton type="submit" :loading="saving" :disabled="!canSubmit">{{ t('changePassword.submit') }}</AppButton>
    </form>
  </AppCard>
</template>
