<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { GENERATED_PASSWORD_LENGTH, generatePassword } from '@lms/shared'
import { useToast } from '@/composables/useToast'
import AppInput from './AppInput.vue'
import Icon from './Icon.vue'

// An admin hands this password to an employee out loud or over a messenger, so
// the field shows it in clear text the moment it is generated instead of making
// them reveal it — and offers a copy button, because retyping a 6-character
// string is exactly where a transcription error gets baked into an account.
const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const toast = useToast()
const revealed = ref(false)

function generate() {
  emit('update:modelValue', generatePassword(GENERATED_PASSWORD_LENGTH))
  revealed.value = true
}

async function copy() {
  if (!props.modelValue) return
  try {
    await navigator.clipboard.writeText(props.modelValue)
    toast.success(t('users.password.copied'))
  } catch {
    // Clipboard access is refused on insecure origins and by some browser
    // policies. The password is on screen either way, so say so rather than
    // failing silently.
    toast.error(t('users.password.copyFailed'))
  }
}
</script>

<template>
  <div>
    <div class="flex items-end gap-2">
      <AppInput
        :model-value="modelValue"
        :type="revealed ? 'text' : 'password'"
        :label="label"
        :required="required"
        :disabled="disabled"
        autocomplete="new-password"
        class="flex-1"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <button
        type="button"
        :disabled="disabled"
        class="flex h-10.5 shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-3 text-small font-medium text-ink transition-default hover:bg-surface-hover disabled:opacity-50"
        @click="generate"
      >
        <Icon name="refresh" size="15" />
        {{ t('users.password.generate') }}
      </button>
      <button
        type="button"
        :disabled="disabled || !modelValue"
        :title="t('users.password.copy')"
        :aria-label="t('users.password.copy')"
        class="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-md border border-border-strong text-ink transition-default hover:bg-surface-hover disabled:opacity-40"
        @click="copy"
      >
        <Icon name="copy" size="15" />
      </button>
    </div>
    <p class="mt-1.5 text-small text-ink-faint">{{ t('users.password.hint', { length: GENERATED_PASSWORD_LENGTH }) }}</p>
  </div>
</template>
