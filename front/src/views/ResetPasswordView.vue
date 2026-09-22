<script setup>
/**
 * Where the link in the password-reset mail lands (`?token=`). Public by
 * necessity — nobody holding this link is signed in, that is the point —
 * and outside the app shell, like the login page it hands back to.
 *
 * The token is only ever sent to the API, never shown; a spent or expired
 * one is the API's answer (INVALID_RESET_TOKEN), and the way out of that is
 * asking for a new link, so the page offers exactly that.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PASSWORD_MIN_LENGTH } from '@lms/shared'
import { securityApi } from '@/services/security'
import { apiErrorText } from '@/utils/apiError'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const token = typeof route.query.token === 'string' ? route.query.token : ''

const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const done = ref(false)
const errorMessage = ref('')
const tokenRejected = ref(!token)

const confirmError = computed(() =>
  confirmPassword.value && confirmPassword.value !== newPassword.value ? t('changePassword.mismatch') : ''
)
const lengthError = computed(() =>
  newPassword.value && newPassword.value.length < PASSWORD_MIN_LENGTH
    ? t('changePassword.tooShort', { length: PASSWORD_MIN_LENGTH })
    : ''
)
const canSubmit = computed(
  () => newPassword.value && confirmPassword.value === newPassword.value && !lengthError.value && !submitting.value
)

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await securityApi.confirmPasswordReset(token, newPassword.value)
    done.value = true
  } catch (error) {
    if (error?.response?.data?.code === 'INVALID_RESET_TOKEN') {
      tokenRejected.value = true
    } else {
      errorMessage.value = apiErrorText(error, t('auth.reset.failed'))
    }
  } finally {
    submitting.value = false
  }
}

function toLogin() {
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
    <div class="w-full max-w-sm">
      <div class="mb-8 flex items-center gap-2.5">
        <div class="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon name="graduation-cap" size="19" />
        </div>
        <span class="text-body font-semibold text-ink">{{ t('app.name') }}</span>
      </div>

      <!-- No token, or one the API refused: spent, expired, or mistyped. -->
      <template v-if="tokenRejected">
        <h1 class="text-[28px] font-bold text-ink">{{ t('auth.reset.invalidTitle') }}</h1>
        <p class="mt-2 text-small text-ink-muted">{{ t('auth.reset.invalidHint') }}</p>
        <AppButton class="mt-8" block size="lg" @click="toLogin">{{ t('auth.reset.toLogin') }}</AppButton>
      </template>

      <template v-else-if="done">
        <h1 class="text-[28px] font-bold text-ink">{{ t('auth.reset.doneTitle') }}</h1>
        <p class="mt-2 text-small text-ink-muted">{{ t('auth.reset.doneHint') }}</p>
        <AppButton class="mt-8" block size="lg" @click="toLogin">{{ t('auth.reset.toLogin') }}</AppButton>
      </template>

      <template v-else>
        <h1 class="text-[28px] font-bold text-ink">{{ t('auth.reset.title') }}</h1>
        <p class="mt-2 text-small text-ink-muted">{{ t('auth.reset.subtitle') }}</p>

        <form class="mt-8 space-y-4" @submit.prevent="onSubmit">
          <AppInput
            v-model="newPassword"
            type="password"
            :label="t('changePassword.new')"
            icon="lock"
            autocomplete="new-password"
            :error="lengthError"
            :hint="t('changePassword.lengthHint', { length: PASSWORD_MIN_LENGTH })"
            autofocus
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

          <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1">
            <div v-if="errorMessage" class="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2.5 text-small text-danger">
              <Icon name="alert-circle" size="16" class="mt-0.5 shrink-0" />
              {{ errorMessage }}
            </div>
          </Transition>

          <AppButton type="submit" block size="lg" :loading="submitting" :disabled="!canSubmit">
            {{ t('auth.reset.submit') }}
          </AppButton>
        </form>
      </template>
    </div>
  </div>
</template>
