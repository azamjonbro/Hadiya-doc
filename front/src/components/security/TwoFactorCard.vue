<script setup>
/**
 * Turning on the second factor, and the recovery codes that come with it
 * (11.6).
 *
 * Three things the screen has to make unmissable, because each is a
 * support conversation otherwise: the secret is shown **once**, the
 * recovery codes are shown **once**, and turning it off needs a code —
 * not the password, since the password is what the second factor protects
 * the account from.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { securityApi } from '@/services/security'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const loading = ref(true)
const busy = ref(false)
const status = ref({ enabled: false, available: true, required: false, recoveryCodesLeft: 0 })

// Held only while the screen is open: this is the one moment the secret
// and the codes exist outside an authenticator app and a piece of paper.
const setup = ref(null)
const recoveryCodes = ref(null)
const code = ref('')

async function load() {
  loading.value = true
  try {
    status.value = await securityApi.twoFactorStatus()
  } catch (error) {
    toast.error(apiErrorText(error, t('security.loadFailed')))
  } finally {
    loading.value = false
  }
}

async function begin() {
  busy.value = true
  try {
    setup.value = await securityApi.beginSetup()
    code.value = ''
  } catch (error) {
    toast.error(apiErrorText(error, t('security.setupFailed')))
  } finally {
    busy.value = false
  }
}

async function enable() {
  busy.value = true
  try {
    const result = await securityApi.enable(code.value.trim())
    recoveryCodes.value = result.recoveryCodes
    setup.value = null
    code.value = ''
    await load()
    toast.success(t('security.enabled'))
  } catch (error) {
    toast.error(apiErrorText(error, t('security.codeRejected')))
  } finally {
    busy.value = false
  }
}

async function disable() {
  if (!(await confirm.ask({ message: t('security.confirmDisable') }))) return
  busy.value = true
  try {
    await securityApi.disable(code.value.trim())
    code.value = ''
    await load()
    toast.success(t('security.disabled'))
  } catch (error) {
    toast.error(apiErrorText(error, t('security.codeRejected')))
  } finally {
    busy.value = false
  }
}

async function regenerate() {
  if (!(await confirm.ask({ message: t('security.confirmRegenerate') }))) return
  busy.value = true
  try {
    const result = await securityApi.regenerateRecoveryCodes(code.value.trim())
    recoveryCodes.value = result.recoveryCodes
    code.value = ''
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('security.codeRejected')))
  } finally {
    busy.value = false
  }
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    toast.success(t('security.copied'))
  } catch {
    // Clipboard access can be refused; the codes are on screen either way.
    toast.error(t('security.copyFailed'))
  }
}

onMounted(load)
</script>

<template>
  <AppCard class="border border-border p-6 shadow-sm">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
        {{ t('security.title') }}
      </h2>
      <Badge :variant="status.enabled ? 'success' : 'warning'" size="sm">
        {{ status.enabled ? t('security.on') : t('security.off') }}
      </Badge>
    </div>
    <p class="mt-2 text-small text-ink-muted">{{ t('security.hint') }}</p>

    <p v-if="loading" class="mt-3 text-caption text-ink-faint">{{ t('common.loading') }}</p>

    <template v-else>
      <!-- An operator's job, and a different sentence from "you have not
           set this up yet". -->
      <p v-if="!status.available" class="mt-3 text-caption text-warning">{{ t('security.unavailable') }}</p>
      <p v-else-if="status.required && !status.enabled" class="mt-3 text-caption text-warning">
        {{ t('security.requiredByPolicy') }}
      </p>

      <!-- Shown once: the secret, and the QR for the app to scan. -->
      <div v-if="setup" class="mt-4 rounded-lg border border-border bg-surface-2 p-4">
        <p class="text-small font-medium text-ink">{{ t('security.scanTitle') }}</p>
        <div class="mt-3 flex flex-wrap items-start gap-4">
          <img :src="setup.qr" :alt="t('security.scanTitle')" class="h-40 w-40 rounded bg-white p-2" />
          <div class="min-w-0 flex-1">
            <p class="text-caption text-ink-muted">{{ t('security.manualEntry') }}</p>
            <code class="mt-1 block break-all rounded bg-surface px-2 py-1.5 text-caption text-ink">{{ setup.secret }}</code>
            <div class="mt-3 flex flex-wrap items-end gap-2">
              <AppInput v-model="code" class="w-40" :label="t('security.codeLabel')" inputmode="numeric" />
              <AppButton size="sm" :loading="busy" @click="enable">{{ t('security.confirm') }}</AppButton>
              <AppButton variant="ghost" size="sm" @click="setup = null">{{ t('common.cancel') }}</AppButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Shown once, and said so plainly. -->
      <div v-if="recoveryCodes" class="mt-4 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3">
        <p class="flex items-center gap-1.5 text-small font-medium text-warning">
          <Icon name="alert-triangle" size="14" />
          {{ t('security.recoveryTitle') }}
        </p>
        <p class="mt-1 text-caption text-ink-muted">{{ t('security.recoveryHint') }}</p>
        <div class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          <code v-for="one in recoveryCodes" :key="one" class="rounded bg-surface px-2 py-1 text-center text-caption text-ink">
            {{ one }}
          </code>
        </div>
        <div class="mt-3 flex gap-2">
          <AppButton size="sm" icon="copy" @click="copyCodes">{{ t('security.copy') }}</AppButton>
          <AppButton variant="ghost" size="sm" @click="recoveryCodes = null">{{ t('security.stored') }}</AppButton>
        </div>
      </div>

      <div v-if="!status.enabled && !setup" class="mt-4">
        <AppButton size="sm" icon="shield" :disabled="!status.available" :loading="busy" @click="begin">
          {{ t('security.turnOn') }}
        </AppButton>
      </div>

      <div v-else-if="status.enabled" class="mt-4 space-y-2">
        <p class="text-caption text-ink-muted">
          {{ t('security.enabledSince', { date: status.confirmedAt ? new Date(status.confirmedAt).toLocaleDateString(locale) : '—' }) }}
          · {{ t('security.recoveryLeft', { count: status.recoveryCodesLeft }) }}
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <AppInput v-model="code" class="w-40" :label="t('security.codeLabel')" />
          <AppButton variant="secondary" size="sm" :loading="busy" @click="regenerate">
            {{ t('security.newRecoveryCodes') }}
          </AppButton>
          <AppButton variant="ghost" size="sm" :loading="busy" @click="disable">{{ t('security.turnOff') }}</AppButton>
        </div>
        <!-- Not the password: whoever has the password is exactly who this
             is protecting the account from. -->
        <p class="text-caption text-ink-faint">{{ t('security.codeNeeded') }}</p>
      </div>
    </template>
  </AppCard>
</template>
