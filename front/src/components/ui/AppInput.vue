<script setup>
import { computed, ref, useId, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  icon: { type: String, default: '' },
  required: { type: Boolean, default: false },
  autocomplete: { type: String, default: 'off' },
  disabled: { type: Boolean, default: false },
  // For the inputs that carry no visible label (a search box next to a
  // magnifier icon, a filter row). The field still has to say what it is
  // to anybody who cannot see where it sits.
  ariaLabel: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
const slots = useSlots()
const { t } = useI18n()

const showPassword = ref(false)
const resolvedType = computed(() => {
  if (props.type !== 'password') return props.type
  return showPassword.value ? 'text' : 'password'
})

const inputId = useId()
const errorId = `${inputId}-error`
const hintId = `${inputId}-hint`

// The error and the hint were on screen but not attached to the field: a
// screen reader read the input, then read a stray sentence some seconds
// later, with nothing saying they belonged together (12.4). Only one of the
// two is ever rendered, so only one is ever referenced.
const describedBy = computed(() => {
  if (props.error) return errorId
  if (props.hint) return hintId
  return undefined
})

// A visible label wins; then an explicit aria-label; then the placeholder.
// The placeholder is a **fallback**, not a substitute — it disappears the
// moment somebody types, so it cannot be the label — but 43 inputs in this
// app are placeholder-only filter and editor fields, and a field announced
// as "edit text" with no name at all is the worse of the two (12.4).
const accessibleName = computed(() => {
  if (props.label) return undefined
  return props.ariaLabel || props.placeholder || undefined
})
</script>

<template>
  <div>
    <label v-if="label" :for="inputId" class="mb-1.5 block text-small font-medium text-ink">
      {{ label }}
      <span v-if="required" class="text-danger" aria-hidden="true">*</span>
    </label>
    <div class="relative">
      <Icon v-if="icon" :name="icon" size="17" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        :id="inputId"
        :type="resolvedType"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :aria-label="accessibleName"
        :aria-required="required || undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="h-10 w-full rounded-md border bg-surface text-small text-ink outline-none transition-default placeholder:text-ink-faint disabled:opacity-50"
        :class="[
          icon ? 'pl-10' : 'pl-3.5',
          type === 'password' ? 'pr-10' : 'pr-3.5',
          error ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger' : 'border-border-strong focus:border-primary focus:ring-1 focus:ring-primary',
        ]"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <!-- Reachable by keyboard (12.4). It used to be tabindex="-1", which
           hid the only way to check a typed password from exactly the people
           most likely to mistype one. -->
      <button
        v-if="type === 'password'"
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-ink-faint hover:text-ink-muted"
        :aria-label="showPassword ? t('a11y.hidePassword') : t('a11y.showPassword')"
        :aria-pressed="showPassword"
        @click="showPassword = !showPassword"
      >
        <Icon :name="showPassword ? 'eye-off' : 'eye'" size="17" />
      </button>
      <div v-if="slots.suffix" class="absolute right-3 top-1/2 -translate-y-1/2">
        <slot name="suffix" />
      </div>
    </div>
    <!-- The error is announced as it appears; the hint is static, so it is
         read only when the field is reached. -->
    <p v-if="error" :id="errorId" class="mt-1.5 text-small text-danger" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="mt-1.5 text-small text-ink-faint">{{ hint }}</p>
  </div>
</template>
