<script setup>
/**
 * The page a QR code on a printed certificate leads to.
 *
 * Public on purpose, and standalone: no app shell, no navigation, no sign-in
 * prompt. Whoever opens this is holding a piece of paper and wants one
 * question answered — is this real — and anything else on the page is in
 * the way of that answer.
 */
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { certificatesApi } from '@/services/certificates'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Icon from '@/components/ui/Icon.vue'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const serial = ref(String(route.params.serial ?? ''))
const certificate = ref(null)
const state = ref('idle') // idle | loading | found | missing | error
const throttled = ref(false)

const statusStyle = {
  VALID: { icon: 'check-circle', tone: 'text-success', ring: 'bg-success-subtle' },
  EXPIRED: { icon: 'clock', tone: 'text-warning', ring: 'bg-warning-subtle' },
  REVOKED: { icon: 'alert-circle', tone: 'text-danger', ring: 'bg-danger-subtle' },
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })
}

async function check() {
  const value = serial.value.trim()
  if (!value) return
  state.value = 'loading'
  throttled.value = false
  try {
    certificate.value = await certificatesApi.verify(value)
    state.value = 'found'
  } catch (error) {
    certificate.value = null
    const status = error.response?.status
    if (status === 404) state.value = 'missing'
    else {
      // 429 is the rate limiter, and saying so is better than a generic
      // failure: the visitor did nothing wrong and only has to wait.
      throttled.value = status === 429
      state.value = 'error'
    }
  }
}

function submit() {
  // Keep the URL in step so the answer can be shared or reloaded.
  if (serial.value.trim() !== route.params.serial) {
    router.replace({ name: 'verify-certificate', params: { serial: serial.value.trim() } })
    return
  }
  check()
}

watch(
  () => route.params.serial,
  (value) => {
    serial.value = String(value ?? '')
    if (serial.value) check()
  }
)

onMounted(() => {
  if (serial.value) check()
})
</script>

<template>
  <div class="min-h-screen bg-surface px-6 py-16">
    <div class="mx-auto max-w-lg">
      <div class="flex items-center gap-2 text-ink-muted">
        <Icon name="shield" size="18" />
        <span class="text-small">{{ t('verify.heading') }}</span>
      </div>
      <h1 class="mt-2 text-h1 text-ink">{{ t('verify.title') }}</h1>
      <p class="mt-1 text-small text-ink-muted">{{ t('verify.subtitle') }}</p>

      <form class="mt-6 flex gap-2" @submit.prevent="submit">
        <AppInput v-model="serial" class="flex-1" :placeholder="t('verify.placeholder')" autocomplete="off" />
        <AppButton type="submit" :loading="state === 'loading'">{{ t('verify.check') }}</AppButton>
      </form>

      <div
        v-if="state === 'found' && certificate"
        class="mt-8 rounded-2xl border border-border bg-surface-1 p-6"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-full"
            :class="statusStyle[certificate.status].ring"
          >
            <Icon :name="statusStyle[certificate.status].icon" size="22" :class="statusStyle[certificate.status].tone" />
          </div>
          <div>
            <p class="text-h3" :class="statusStyle[certificate.status].tone">
              {{ t(`verify.status.${certificate.status}`) }}
            </p>
            <p class="text-small text-ink-muted">{{ t(`verify.statusHint.${certificate.status}`) }}</p>
          </div>
        </div>

        <dl class="mt-6 space-y-3 border-t border-border pt-5 text-small">
          <div class="flex justify-between gap-4">
            <dt class="text-ink-muted">{{ t('verify.fullName') }}</dt>
            <dd class="text-right font-medium text-ink">{{ certificate.fullName }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-ink-muted">{{ t('verify.course') }}</dt>
            <dd class="text-right text-ink">{{ certificate.title }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-ink-muted">{{ t('verify.issuedAt') }}</dt>
            <dd class="text-right text-ink">{{ formatDate(certificate.issuedAt) }}</dd>
          </div>
          <div v-if="certificate.validUntil" class="flex justify-between gap-4">
            <dt class="text-ink-muted">{{ t('verify.validUntil') }}</dt>
            <dd class="text-right text-ink">{{ formatDate(certificate.validUntil) }}</dd>
          </div>
          <div v-if="certificate.revokedAt" class="flex justify-between gap-4">
            <dt class="text-ink-muted">{{ t('verify.revokedAt') }}</dt>
            <dd class="text-right text-ink">{{ formatDate(certificate.revokedAt) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-ink-muted">{{ t('verify.serial') }}</dt>
            <dd class="text-right font-mono text-ink">{{ certificate.serial }}</dd>
          </div>
        </dl>
      </div>

      <div
        v-else-if="state === 'missing'"
        class="mt-8 rounded-2xl border border-border bg-surface-1 p-6 text-center"
      >
        <Icon name="alert-circle" size="24" class="mx-auto text-ink-faint" />
        <p class="mt-3 text-h3 text-ink">{{ t('verify.notFound') }}</p>
        <p class="mt-1 text-small text-ink-muted">{{ t('verify.notFoundHint') }}</p>
      </div>

      <p v-else-if="state === 'error'" class="mt-8 text-center text-small text-danger">
        {{ throttled ? t('verify.throttled') : t('verify.error') }}
      </p>
    </div>
  </div>
</template>
