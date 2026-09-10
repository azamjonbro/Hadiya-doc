<script setup>
/**
 * Where the identity provider's redirect lands (11.4).
 *
 * The API does the whole OIDC exchange and sends the browser here with a
 * **handoff code**, never with a token: a token in a URL is in the
 * browser's history, in the referrer of whatever loads next, and in any
 * log that records the redirect. This page trades the code for a session
 * the moment it mounts, then replaces itself in the history so the code —
 * already single-use — is not sitting in the back button either.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { homeRouteFor } from '@/router'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const failure = ref('')

onMounted(async () => {
  // The provider's own failure, or ours, passed through by the callback.
  const reported = typeof route.query.error === 'string' ? route.query.error : ''
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  if (reported || !code) {
    failure.value = reported ? t(`auth.sso.errors.${reported}`, t('auth.sso.errors.generic')) : t('auth.sso.errors.generic')
    return
  }

  try {
    const result = await auth.completeSso(code)
    if (result.requiresFaceVerification) {
      // The face policy applies to an SSO login too, and the panel lives
      // on the login page — so hand the challenge back there rather than
      // building a second copy of it here.
      router.replace({ name: 'login', query: { faceToken: result.verificationToken } })
      return
    }
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : null
    // `replace`, not `push`: the URL holds a used code, and leaving it in
    // the history means the back button lands on a page that fails.
    router.replace(next ?? homeRouteFor(auth))
  } catch (error) {
    failure.value = apiErrorText(error, t('auth.sso.errors.generic'))
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg px-4">
    <div class="w-full max-w-sm text-center">
      <template v-if="failure">
        <span class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <Icon name="alert-circle" size="20" />
        </span>
        <h1 class="mt-4 text-h2 text-ink">{{ t('auth.sso.failedTitle') }}</h1>
        <p class="mt-2 text-small text-ink-muted">{{ failure }}</p>
        <AppButton class="mt-6" @click="router.replace({ name: 'login' })">
          {{ t('auth.sso.backToLogin') }}
        </AppButton>
      </template>
      <template v-else>
        <span class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
          <Icon name="loader" size="20" class="animate-spin" />
        </span>
        <p class="mt-4 text-small text-ink-muted">{{ t('auth.sso.signingIn') }}</p>
      </template>
    </div>
  </div>
</template>
