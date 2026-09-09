<script setup>
import { computed } from 'vue'
import AppInput from './AppInput.vue'
import AppSelect from './AppSelect.vue'
import AppDatePicker from './AppDatePicker.vue'
import BranchSelect from './BranchSelect.vue'
import AppButton from './AppButton.vue'

/**
 * The row of filter controls above a list, and the two decisions every one of
 * them had made separately: what counts as "a filter is active" and what
 * clearing does.
 *
 * Four screens each kept their own `hasActiveFilters` computed listing their
 * own field names by hand, so adding a filter and forgetting to add it to
 * that list left a screen filtered with no way to see it or clear it. Here
 * "active" is derived from the field list itself, which is the same list the
 * controls are rendered from — the two cannot drift apart.
 *
 * The model is the caller's own filters object, mutated in place, because
 * that is what the callers already had and what they build query params
 * from. Only whole-object replacement (clear) is emitted.
 */
const props = defineProps({
  // The reactive filters object the caller owns.
  modelValue: { type: Object, required: true },
  /**
   * [{ key, type, placeholder, label, options, width }]
   * type: 'search' | 'select' | 'branch' | 'date'
   */
  fields: { type: Array, required: true },
  applyLabel: { type: String, default: '' },
  clearLabel: { type: String, default: '' },
  // Selects and dates apply the moment they change — there is nothing to
  // finish typing. Only the text box waits for Enter or the button.
  applyOnChange: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'apply', 'clear'])

const hasActiveFilters = computed(() => props.fields.some((field) => props.modelValue[field.key]))

function set(key, value) {
  props.modelValue[key] = value
}

function onChanged(field, value) {
  set(field.key, value)
  if (props.applyOnChange && field.type !== 'search') emit('apply')
}

function clear() {
  for (const field of props.fields) props.modelValue[field.key] = ''
  emit('clear')
  emit('apply')
}
</script>

<template>
  <!-- items-center, not items-end: none of these controls has a label, and
       the button is 4px shorter than the fields, so bottom alignment left it
       visibly sunk below the row. -->
  <div class="flex flex-wrap items-center gap-3">
    <div v-for="field in fields" :key="field.key" :class="field.width ?? 'w-44'">
      <AppInput
        v-if="field.type === 'search'"
        :model-value="modelValue[field.key]"
        icon="search"
        :placeholder="field.placeholder"
        @update:model-value="set(field.key, $event)"
        @keyup.enter="emit('apply')"
      />
      <BranchSelect
        v-else-if="field.type === 'branch'"
        :model-value="modelValue[field.key]"
        :options="field.options"
        :placeholder="field.placeholder"
        @update:model-value="onChanged(field, $event)"
      />
      <AppDatePicker
        v-else-if="field.type === 'date'"
        :model-value="modelValue[field.key]"
        :placeholder="field.placeholder"
        @update:model-value="onChanged(field, $event)"
      />
      <AppSelect
        v-else
        :model-value="modelValue[field.key]"
        :placeholder="field.placeholder"
        :options="field.options ?? []"
        @update:model-value="onChanged(field, $event)"
      />
    </div>

    <slot />

    <AppButton v-if="applyLabel" variant="outline" icon="search" @click="emit('apply')">{{ applyLabel }}</AppButton>
    <AppButton v-if="hasActiveFilters && clearLabel" variant="ghost" icon="close" @click="clear">
      {{ clearLabel }}
    </AppButton>
  </div>
</template>
