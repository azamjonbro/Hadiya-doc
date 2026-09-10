<script setup>
/**
 * API keys (11.1).
 *
 * The screen exists to make three facts unmissable, because each of them is
 * a support conversation otherwise: the key is shown **once**, a key reads
 * across the whole company (so its scopes are the only limit), and
 * identifiers are a separate tick-box from "may read employees".
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiKeysApi } from '@/services/apiKeys'
import { API_ORIGIN } from '@/services/apiBase'
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

const keys = ref([])
const scopes = ref([])
const loading = ref(true)
const creating = ref(false)

const form = ref({ name: '', scopes: [], includePii: false, rateLimitPerMinute: 60 })
// Held only until the page is left: this is the one moment the key exists
// outside whoever asked for it.
const issued = ref(null)

const canCreate = computed(() => form.value.name.trim().length >= 2 && form.value.scopes.length > 0)

// The generated reference (11.3). Built from API_ORIGIN rather than written
// out, because the docs live on the API host and this page is served from
// the SPA host — a hardcoded URL would be right in exactly one deployment.
const docsUrl = `${API_ORIGIN}/api/docs`

async function load() {
  loading.value = true
  try {
    const [list, grantable] = await Promise.all([apiKeysApi.list(), apiKeysApi.scopes()])
    keys.value = list
    scopes.value = grantable
  } catch (error) {
    toast.error(apiErrorText(error, t('apiKeys.loadFailed')))
  } finally {
    loading.value = false
  }
}

function toggleScope(scope) {
  const next = new Set(form.value.scopes)
  next.has(scope) ? next.delete(scope) : next.add(scope)
  form.value.scopes = [...next]
}

async function create() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    issued.value = await apiKeysApi.create({
      name: form.value.name.trim(),
      scopes: form.value.scopes,
      includePii: form.value.includePii,
      rateLimitPerMinute: Number(form.value.rateLimitPerMinute) || 60,
    })
    form.value = { name: '', scopes: [], includePii: false, rateLimitPerMinute: 60 }
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('apiKeys.createFailed')))
  } finally {
    creating.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(issued.value.key)
    toast.success(t('apiKeys.copied'))
  } catch {
    // Clipboard access can be refused; the key is on screen either way.
    toast.error(t('apiKeys.copyFailed'))
  }
}

async function revoke(key) {
  if (!(await confirm.ask({ message: t('apiKeys.confirmRevoke', { name: key.name }) }))) return
  try {
    await apiKeysApi.revoke(key.id)
    await load()
    toast.success(t('apiKeys.revoked'))
  } catch (error) {
    toast.error(apiErrorText(error, t('apiKeys.revokeFailed')))
  }
}

onMounted(load)
</script>

<template>
  <AppCard>
    <h2 class="text-small font-semibold text-ink">{{ t('apiKeys.title') }}</h2>
    <p class="mt-0.5 text-caption text-ink-muted">{{ t('apiKeys.hint') }}</p>

    <!-- Shown once, and said so plainly. -->
    <div v-if="issued" class="mt-3 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2.5">
      <p class="flex items-center gap-1.5 text-small font-medium text-warning">
        <Icon name="alert-triangle" size="14" />
        {{ t('apiKeys.copyNow') }}
      </p>
      <code class="mt-1.5 block break-all rounded bg-surface px-2 py-1.5 text-caption text-ink">{{ issued.key }}</code>
      <div class="mt-2 flex gap-2">
        <AppButton size="sm" icon="copy" @click="copy">{{ t('apiKeys.copy') }}</AppButton>
        <AppButton variant="ghost" size="sm" @click="issued = null">{{ t('apiKeys.stored') }}</AppButton>
      </div>
    </div>

    <p v-if="loading" class="mt-3 text-caption text-ink-faint">{{ t('common.loading') }}</p>

    <ul v-else-if="keys.length" class="mt-3 divide-y divide-border">
      <li v-for="key in keys" :key="key.id" class="flex flex-wrap items-center gap-2 py-2">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-small font-medium text-ink">
            {{ key.name }}
            <code class="ml-1 text-caption text-ink-faint">{{ key.prefix }}…</code>
          </span>
          <span class="block truncate text-caption text-ink-faint">
            {{ key.scopes.join(', ') }}
            <template v-if="key.includePii"> · {{ t('apiKeys.withPii') }}</template>
            · {{ t('apiKeys.perMinute', { count: key.rateLimitPerMinute }) }}
            <template v-if="key.lastUsedAt">
              · {{ t('apiKeys.lastUsed', { date: new Date(key.lastUsedAt).toLocaleString(locale) }) }}
            </template>
            <template v-else> · {{ t('apiKeys.neverUsed') }}</template>
          </span>
        </span>
        <Badge v-if="key.revokedAt" variant="danger" size="sm">{{ t('apiKeys.revokedLabel') }}</Badge>
        <Badge v-else variant="success" size="sm">{{ t('apiKeys.activeLabel') }}</Badge>
        <AppButton v-if="!key.revokedAt" variant="ghost" size="sm" icon="lock" @click="revoke(key)">
          {{ t('apiKeys.revoke') }}
        </AppButton>
      </li>
    </ul>

    <p v-else class="mt-3 text-caption text-ink-faint">{{ t('apiKeys.empty') }}</p>

    <div class="mt-4 space-y-2 border-t border-border pt-3">
      <p class="text-caption font-medium text-ink-muted">{{ t('apiKeys.newTitle') }}</p>
      <div class="flex flex-wrap gap-2">
        <AppInput v-model="form.name" class="min-w-0 flex-1" :placeholder="t('apiKeys.namePlaceholder')" />
        <AppInput v-model="form.rateLimitPerMinute" type="number" min="1" class="w-36" :label="t('apiKeys.limitLabel')" />
      </div>

      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="scope in scopes"
          :key="scope"
          type="button"
          class="rounded-full border px-2.5 py-1 text-caption transition-default"
          :class="form.scopes.includes(scope) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-ink-muted hover:border-border-strong'"
          @click="toggleScope(scope)"
        >
          {{ scope }}
        </button>
      </div>

      <label class="flex items-center gap-2 text-caption text-ink-muted">
        <input v-model="form.includePii" type="checkbox" class="h-3.5 w-3.5 rounded border-border-strong text-primary" />
        {{ t('apiKeys.includePii') }}
      </label>

      <AppButton size="sm" :disabled="!canCreate" :loading="creating" icon="plus" @click="create">
        {{ t('apiKeys.create') }}
      </AppButton>
      <p class="text-caption text-ink-faint">{{ t('apiKeys.readOnlyNote') }}</p>
      <p class="text-caption text-ink-faint">
        <a :href="docsUrl" target="_blank" rel="noopener" class="text-primary hover:underline">
          {{ t('apiKeys.docsLink') }}
        </a>
      </p>
    </div>
  </AppCard>
</template>
