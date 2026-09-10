<script setup>
/**
 * Single sign-on: the switch and the mapping (11.4).
 *
 * The issuer and the client secret are **not** here — they are environment
 * configuration, so this screen cannot leak them and an administrator
 * cannot break the connection by editing a field. What it does hold is the
 * part that is wrong on the first attempt at every new provider: which
 * claim carries a department, which group makes somebody an admin.
 *
 * "Configured" and "enabled" are shown separately because they are
 * different people's jobs: an empty issuer is an operator's, a switch is
 * an administrator's, and one message for both sends the wrong person
 * looking.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { platformSettingsApi } from '@/services/platformSettings'
import { ssoApi } from '@/services/sso'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'

const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const status = ref({ configured: false, enabled: false })

const form = ref({
  enabled: false,
  buttonLabel: '',
  autoProvision: false,
  defaultRoleName: 'EMPLOYEE',
  allowedEmailDomains: '',
  syncOnLogin: true,
  claims: { jshshir: '', email: 'email', firstName: 'given_name', lastName: 'family_name', fullName: 'name', department: '', branch: '', position: '' },
})
// Edited as rows; an empty row is how one is added.
const roleRules = ref([])

// The claim fields, in the order somebody fills them in: the identifier
// first, because without it JIT provisioning is refused.
const CLAIM_FIELDS = ['jshshir', 'email', 'firstName', 'lastName', 'fullName', 'department', 'branch', 'position']

async function load() {
  loading.value = true
  try {
    const [settings, ssoStatus] = await Promise.all([platformSettingsApi.get(), ssoApi.status().catch(() => null)])
    const sso = settings?.sso ?? {}
    form.value = {
      enabled: Boolean(sso.enabled),
      buttonLabel: sso.buttonLabel ?? '',
      autoProvision: Boolean(sso.autoProvision),
      defaultRoleName: sso.defaultRoleName || 'EMPLOYEE',
      // A textarea of domains rather than a tag editor: this list is
      // typed once and read rarely.
      allowedEmailDomains: (sso.allowedEmailDomains ?? []).join(', '),
      syncOnLogin: sso.syncOnLogin !== false,
      claims: { ...form.value.claims, ...(sso.claims ?? {}) },
    }
    roleRules.value = (sso.roleRules ?? []).map((rule) => ({ ...rule }))
    if (ssoStatus) status.value = ssoStatus
  } catch (error) {
    toast.error(apiErrorText(error, t('sso.loadFailed')))
  } finally {
    loading.value = false
  }
}

function addRule() {
  roleRules.value.push({ claim: 'groups', equals: '', roleName: '' })
}

function removeRule(index) {
  roleRules.value.splice(index, 1)
}

async function save() {
  saving.value = true
  try {
    await platformSettingsApi.update({
      sso: {
        enabled: form.value.enabled,
        buttonLabel: form.value.buttonLabel.trim(),
        autoProvision: form.value.autoProvision,
        defaultRoleName: form.value.defaultRoleName.trim() || 'EMPLOYEE',
        allowedEmailDomains: form.value.allowedEmailDomains
          .split(/[,\s]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
        syncOnLogin: form.value.syncOnLogin,
        claims: form.value.claims,
        // Incomplete rows are dropped rather than rejected: a half-typed
        // rule is somebody mid-thought, not an error worth a red box.
        roleRules: roleRules.value
          .filter((rule) => rule.claim?.trim() && rule.equals?.trim() && rule.roleName?.trim())
          .map((rule) => ({ claim: rule.claim.trim(), equals: rule.equals.trim(), roleName: rule.roleName.trim() })),
      },
    })
    toast.success(t('sso.saved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('sso.saveFailed')))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppCard>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="min-w-0 flex-1 text-small font-semibold text-ink">{{ t('sso.title') }}</h2>
      <Badge :variant="status.configured ? 'success' : 'warning'" size="sm">
        {{ status.configured ? t('sso.configured') : t('sso.notConfigured') }}
      </Badge>
    </div>
    <p class="mt-0.5 text-caption text-ink-muted">{{ t('sso.hint') }}</p>
    <p v-if="!status.configured" class="mt-2 text-caption text-warning">{{ t('sso.notConfiguredHint') }}</p>

    <p v-if="loading" class="mt-3 text-caption text-ink-faint">{{ t('common.loading') }}</p>

    <template v-else>
      <label class="mt-3 flex items-center gap-2 text-small text-ink">
        <input v-model="form.enabled" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
        {{ t('sso.enabled') }}
      </label>

      <div class="mt-3 flex flex-wrap gap-2">
        <AppInput v-model="form.buttonLabel" class="min-w-0 flex-1" :label="t('sso.buttonLabel')" :placeholder="t('sso.buttonLabelPlaceholder')" />
        <AppInput v-model="form.defaultRoleName" class="w-44" :label="t('sso.defaultRole')" />
      </div>

      <label class="mt-3 flex items-start gap-2 text-small text-ink">
        <input v-model="form.autoProvision" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-border-strong text-primary" />
        <span>
          {{ t('sso.autoProvision') }}
          <span class="block text-caption text-ink-faint">{{ t('sso.autoProvisionHint') }}</span>
        </span>
      </label>

      <label class="mt-3 flex items-start gap-2 text-small text-ink">
        <input v-model="form.syncOnLogin" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-border-strong text-primary" />
        <span>
          {{ t('sso.syncOnLogin') }}
          <span class="block text-caption text-ink-faint">{{ t('sso.syncOnLoginHint') }}</span>
        </span>
      </label>

      <div class="mt-3">
        <AppInput
          v-model="form.allowedEmailDomains"
          :label="t('sso.allowedDomains')"
          placeholder="example.uz, company.uz"
        />
        <p class="mt-1 text-caption text-ink-faint">{{ t('sso.allowedDomainsHint') }}</p>
      </div>

      <div class="mt-4 border-t border-border pt-3">
        <p class="text-caption font-medium text-ink-muted">{{ t('sso.claimsTitle') }}</p>
        <p class="mt-0.5 text-caption text-ink-faint">{{ t('sso.claimsHint') }}</p>
        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <AppInput
            v-for="field in CLAIM_FIELDS"
            :key="field"
            v-model="form.claims[field]"
            :label="t(`sso.claim.${field}`)"
            :placeholder="field === 'jshshir' ? t('sso.claimJshshirPlaceholder') : ''"
          />
        </div>
      </div>

      <div class="mt-4 border-t border-border pt-3">
        <p class="text-caption font-medium text-ink-muted">{{ t('sso.rulesTitle') }}</p>
        <p class="mt-0.5 text-caption text-ink-faint">{{ t('sso.rulesHint') }}</p>

        <div v-for="(rule, index) in roleRules" :key="index" class="mt-2 flex flex-wrap items-end gap-2">
          <AppInput v-model="rule.claim" class="w-32" :label="t('sso.ruleClaim')" />
          <AppInput v-model="rule.equals" class="min-w-0 flex-1" :label="t('sso.ruleEquals')" />
          <AppInput v-model="rule.roleName" class="w-40" :label="t('sso.ruleRole')" />
          <AppButton variant="ghost" size="sm" icon="trash-2" @click="removeRule(index)">
            {{ t('common.delete') }}
          </AppButton>
        </div>

        <AppButton class="mt-2" variant="ghost" size="sm" icon="plus" @click="addRule">
          {{ t('sso.addRule') }}
        </AppButton>
      </div>

      <AppButton class="mt-4" size="sm" :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
    </template>
  </AppCard>
</template>
