<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FACE_POLICY_DEFAULTS } from '@lms/shared'
import { useToast } from '@/composables/useToast'
import { facePolicyApi } from '@/services/facePolicy'
import AppButton from '@/components/ui/AppButton.vue'

/**
 * The organisation-wide face-verification settings. One scope only — there is
 * no per-course override, on purpose: a course that could opt itself out of
 * identity checks would make the whole setting advisory.
 */
defineProps({
  readonly: { type: Boolean, default: false },
})

const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const effective = ref({ ...FACE_POLICY_DEFAULTS })

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    effective.value = (await facePolicyApi.getGlobal()).effective
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

load()

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    effective.value = (await facePolicyApi.updateGlobal({ verifyEveryOpen: effective.value.verifyEveryOpen })).effective
    toast.success(t('facePolicy.saved'))
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="loading" class="text-small text-ink-faint">{{ t('common.loading') }}</p>

    <template v-else>
      <label class="flex items-start gap-3">
        <input
          v-model="effective.verifyEveryOpen"
          type="checkbox"
          class="mt-0.5 h-4 w-4 rounded border-border-strong text-primary"
          :disabled="readonly"
        />
        <span class="flex-1">
          <span class="text-small text-ink">{{ t('facePolicy.fields.verifyEveryOpen.label') }}</span>
          <span class="mt-0.5 block text-caption text-ink-faint">
            {{ t('facePolicy.fields.verifyEveryOpen.hint') }}
          </span>
        </span>
      </label>

      <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

      <div v-if="!readonly" class="mt-5">
        <AppButton :loading="saving" @click="save">{{ t('facePolicy.save') }}</AppButton>
      </div>
    </template>
  </div>
</template>
