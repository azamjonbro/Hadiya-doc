<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { homeRouteFor } from '@/router'
import { useFaceVerification } from '@/composables/useFaceVerification'
import { apiErrorText } from '@/utils/apiError'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'
import FaceVerificationPanel from '@/components/face/FaceVerificationPanel.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const identifier = ref('')
const password = ref('')
const rememberMe = ref(true)
const submitting = ref(false)
const errorMessage = ref('')

// Set once the password step returns a face-verification challenge instead
// of a session — swaps the form for FaceVerificationPanel in place, on the
// same page, rather than a separate route (there is nothing to bookmark or
// navigate to mid-login).
const pendingVerificationToken = ref('')
const faceState = ref('idle')
const faceErrorMessage = ref('')
const faceVerification = useFaceVerification()

function goHome() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
  router.push(redirect ?? homeRouteFor(auth))
}

async function runFaceCapture() {
  faceState.value = 'requestingCamera'
  faceErrorMessage.value = ''
  try {
    const photoBlob = await faceVerification.capture()
    faceState.value = 'verifying'
    await auth.completeFaceLogin(pendingVerificationToken.value, photoBlob)
    faceState.value = 'success'
    setTimeout(goHome, 600)
  } catch (error) {
    if (error?.response) {
      faceState.value = error.response.status === 429 ? 'locked' : 'failed'
      return
    }
    const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
    faceState.value = denied ? 'denied' : 'error'
    faceErrorMessage.value = error?.message ?? String(error)
  } finally {
    // Releases the track and turns the camera light off. Runs on the success
    // path too, which it never did before: the preview kept streaming (and
    // the indicator stayed lit) for as long as the page was open. stop() is
    // idempotent, so the error paths are unaffected.
    faceVerification.stop()
  }
}

// Everything that isn't "these credentials are wrong" needs to say so.
// Falling straight through to auth.login.error told a rate-limited user —
// or one hitting a dead API — that their perfectly correct password was
// invalid, so they retried, burned more of the budget and stayed locked out.
function loginErrorMessage(error) {
  if (!error.response) return t('auth.login.networkError')

  const { status, data } = error.response
  if (status === 429) return t(data?.code === 'ACCOUNT_LOCKED' ? 'auth.login.accountLocked' : 'auth.login.rateLimited')
  if (status >= 500) return t('auth.login.serverError')
  if (status === 401) return t('auth.login.error')
  // Everything else goes through the shared translator, so a code this page
  // does not special-case still arrives in the reader's language.
  return apiErrorText(error, t('auth.login.error'))
}

async function onSubmit() {
  submitting.value = true
  errorMessage.value = ''
  try {
    const result = await auth.login(identifier.value, password.value)
    if (result.requiresFaceVerification) {
      pendingVerificationToken.value = result.verificationToken
      faceState.value = 'idle'
      return
    }
    // One login page for both sides now, so where "home" is depends on who
    // signed in: admin-tier accounts land in the admin area, everyone else on
    // their own dashboard. An explicit ?redirect= still wins — it is the page
    // they were actually trying to reach.
    goHome()
  } catch (error) {
    errorMessage.value = loginErrorMessage(error)
  } finally {
    submitting.value = false
  }
}

const highlights = [
  { icon: 'graduation-cap', textKey: 'auth.login.highlight1' },
  { icon: 'bar-chart', textKey: 'auth.login.highlight2' },
  { icon: 'shield', textKey: 'auth.login.highlight3' },
]
</script>

<template>
  <div class="flex min-h-screen bg-bg">
    <!-- Brand panel -->
    <div
      class="auth-brand relative hidden w-[44%] max-w-xl shrink-0 overflow-hidden border-r border-white/[0.06] lg:flex lg:flex-col lg:justify-between"
    >
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.06]"
        style="background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 22px 22px; color: white"
      />
      <div class="relative z-10 flex items-center gap-2.5 px-10 pt-10">
        <div class="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white">
          <Icon name="graduation-cap" size="19" />
        </div>
        <span class="text-body font-semibold text-white">{{ t('app.name') }}</span>
      </div>

      <div class="relative z-10 px-10 py-10">
        <h1 class="max-w-md text-display text-white">{{ t('auth.login.brandTitle') }}</h1>
        <p class="mt-4 max-w-sm text-body text-white/60">{{ t('auth.login.brandSubtitle') }}</p>

        <div class="mt-10 space-y-4">
          <div v-for="item in highlights" :key="item.icon" class="flex items-center gap-3 text-white/85">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10">
              <Icon :name="item.icon" size="15" />
            </span>
            <span class="text-small">{{ t(item.textKey) }}</span>
          </div>
        </div>
      </div>

      <div class="relative z-10 px-10 pb-10 text-caption text-white/35">© {{ new Date().getFullYear() }} {{ t('app.name') }}</div>
    </div>

    <!-- Form panel -->
    <div class="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-2.5 lg:hidden">
          <div class="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Icon name="graduation-cap" size="19" />
          </div>
          <span class="text-body font-semibold text-ink">{{ t('app.name') }}</span>
        </div>

        <template v-if="!pendingVerificationToken">
          <h1 class="text-h1 text-ink">{{ t('auth.login.title') }}</h1>
          <p class="mt-2 text-small text-ink-muted">{{ t('auth.login.subtitle') }}</p>

          <form class="mt-8 space-y-4" @submit.prevent="onSubmit">
            <AppInput
              v-model="identifier"
              :label="t('auth.login.identifier')"
              icon="user"
              autocomplete="username"
              required
            />
            <AppInput
              v-model="password"
              type="password"
              :label="t('auth.login.password')"
              icon="lock"
              autocomplete="current-password"
              required
            />

            <div class="flex items-center justify-between pt-1">
              <label class="flex select-none items-center gap-2 text-small text-ink-muted">
                <input v-model="rememberMe" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary/30" />
                {{ t('auth.login.rememberMe') }}
              </label>
              <a href="#" class="text-small font-medium text-primary hover:underline">{{ t('auth.login.forgotPassword') }}</a>
            </div>

            <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1">
              <div v-if="errorMessage" class="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2.5 text-small text-danger">
                <Icon name="alert-circle" size="16" class="mt-0.5 shrink-0" />
                {{ errorMessage }}
              </div>
            </Transition>

            <AppButton type="submit" block size="lg" :loading="submitting">
              {{ submitting ? t('auth.login.submitting') : t('auth.login.submit') }}
            </AppButton>
          </form>

          <p class="mt-6 flex items-start gap-2 text-caption text-ink-faint">
            <Icon name="shield" size="14" class="mt-0.5 shrink-0" />
            {{ t('auth.login.securityNotice') }}
          </p>
        </template>

        <!-- Password accepted, a daily face check still stands between this
             login and a session. Same page, same card — nothing to
             bookmark mid-login. -->
        <FaceVerificationPanel
          v-else
          :state="faceState"
          :error-message="faceErrorMessage"
          :stream="faceVerification.cameraStream.value"
          variant="inline"
          @start="runFaceCapture"
          @retry="runFaceCapture"
        />
      </div>
    </div>
  </div>
</template>
