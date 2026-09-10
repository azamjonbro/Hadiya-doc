<script setup>
import { computed, ref, useSlots } from 'vue'
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
})

defineEmits(['update:modelValue'])
const slots = useSlots()

const showPassword = ref(false)
const resolvedType = computed(() => {
  if (props.type !== 'password') return props.type
  return showPassword.value ? 'text' : 'password'
})

const inputId = `input-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <div>
    <label v-if="label" :for="inputId" class="mb-1.5 block text-small font-medium text-ink">
      {{ label }}
      <span v-if="required" class="text-danger">*</span>
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
        class="h-10 w-full rounded-md border bg-surface text-small text-ink outline-none transition-default placeholder:text-ink-faint disabled:opacity-50"
        :class="[
          icon ? 'pl-10' : 'pl-3.5',
          type === 'password' ? 'pr-10' : 'pr-3.5',
          error ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger' : 'border-border focus:border-primary focus:ring-1 focus:ring-primary',
        ]"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="type === 'password'"
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted"
        tabindex="-1"
        @click="showPassword = !showPassword"
      >
        <Icon :name="showPassword ? 'eye-off' : 'eye'" size="17" />
      </button>
      <div v-if="slots.suffix" class="absolute right-3 top-1/2 -translate-y-1/2">
        <slot name="suffix" />
      </div>
    </div>
    <p v-if="error" class="mt-1.5 text-small text-danger">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-small text-ink-faint">{{ hint }}</p>
  </div>
</template>
