<script setup>
/**
 * The AI budget (10.6).
 *
 * Two controls, and both exist because of a specific failure. The switch is
 * separate from the budget so that a company which wants AI off does not
 * have to set a ceiling of zero and have its authors read "budget
 * exceeded" as the explanation. The ceiling is monthly tokens rather than
 * a request count because generation calls differ by two orders of
 * magnitude — counting requests would either block the cheap ones or let a
 * handful of expensive ones run the bill up.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { platformSettingsApi } from '@/services/platformSettings'
import { aiGenerationApi } from '@/services/aiGeneration'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'

const { t, locale } = useI18n()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const budget = ref(0)
const enabled = ref(true)
const usage = ref(null)

async function load() {
  loading.value = true
  try {
    const [settings, month] = await Promise.all([
      platformSettingsApi.get(),
      aiGenerationApi.usage().catch(() => null),
    ])
    budget.value = settings?.ai?.monthlyTokenBudget ?? 0
    enabled.value = settings?.ai?.generationEnabled !== false
    usage.value = month
  } catch (error) {
    toast.error(apiErrorText(error, t('ai.settingsLoadFailed')))
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await platformSettingsApi.update({
      ai: { monthlyTokenBudget: Number(budget.value) || 0, generationEnabled: enabled.value },
    })
    toast.success(t('ai.settingsSaved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('ai.settingsSaveFailed')))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppCard>
    <h2 class="text-small font-semibold text-ink">{{ t('ai.settingsTitle') }}</h2>
    <p class="mt-0.5 text-caption text-ink-muted">{{ t('ai.settingsHint') }}</p>

    <p v-if="loading" class="mt-3 text-caption text-ink-faint">{{ t('common.loading') }}</p>

    <template v-else>
      <label class="mt-3 flex items-center gap-2 text-small text-ink">
        <input v-model="enabled" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
        {{ t('ai.settingsEnabled') }}
      </label>

      <div class="mt-3 flex flex-wrap items-end gap-2">
        <AppInput v-model="budget" type="number" min="0" class="w-52" :label="t('ai.settingsBudget')" />
        <AppButton size="sm" :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </div>
      <p class="mt-1 text-caption text-ink-faint">{{ t('ai.settingsZero') }}</p>

      <p v-if="usage" class="mt-3 text-caption" :class="usage.exceeded ? 'text-danger' : 'text-ink-muted'">
        {{ t('ai.settingsUsed', { used: usage.used.toLocaleString(locale), month: usage.month, jobs: usage.jobs }) }}
      </p>
    </template>
  </AppCard>
</template>
