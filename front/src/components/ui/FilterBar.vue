<script setup>
import { computed } from 'vue'
import AppInput from './AppInput.vue'
import AppSelect from './AppSelect.vue'
import AppDatePicker from './AppDatePicker.vue'
import BranchSelect from './BranchSelect.vue'
import UserPicker from './UserPicker.vue'
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
   * [{ key, type, placeholder, label, options, width, displayKey }]
   * type: 'search' | 'select' | 'branch' | 'date' | 'user'
   *
   * `displayKey` belongs to 'user': the chosen person's id goes in `key`, and
   * their name in `displayKey`, so a filter restored from a saved view can
   * show who it is filtering by without a round trip to look the name up.
   */
  fields: { type: Array, required: true },
  applyLabel: { type: String, default: '' },
  clearLabel: { type: String, default: '' },
  // Labelled controls line up along their bottom edge; unlabelled ones are
  // centred, because a row of bare boxes with a button 4px shorter than they
  // are looks sunk when bottom-aligned.
  align: { type: String, default: 'center' },
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

function pickUser(field, user) {
  props.modelValue[field.key] = user?.id ?? ''
  if (field.displayKey) props.modelValue[field.displayKey] = user?.fullName ?? ''
  emit('apply')
}

function clear() {
  for (const field of props.fields) {
    props.modelValue[field.key] = ''
    if (field.displayKey) props.modelValue[field.displayKey] = ''
  }
  emit('clear')
  emit('apply')
}
</script>

<template>
  <div class="flex flex-wrap gap-3" :class="align === 'end' ? 'items-end' : 'items-center'">
    <div v-for="field in fields" :key="field.key" :class="field.width ?? 'w-44'">
      <AppInput
        v-if="field.type === 'search'"
        :model-value="modelValue[field.key]"
        icon="search"
        :label="field.label"
        :placeholder="field.placeholder"
        @update:model-value="set(field.key, $event)"
        @keyup.enter="emit('apply')"
      />
      <UserPicker
        v-else-if="field.type === 'user'"
        :model-value="modelValue[field.key]"
        :display-name="field.displayKey ? modelValue[field.displayKey] : ''"
        :label="field.label"
        :placeholder="field.placeholder"
        @select="pickUser(field, $event)"
        @clear="pickUser(field, null)"
      />
      <BranchSelect
        v-else-if="field.type === 'branch'"
        :model-value="modelValue[field.key]"
        :options="field.options"
        :label="field.label"
        :placeholder="field.placeholder"
        @update:model-value="onChanged(field, $event)"
      />
      <AppDatePicker
        v-else-if="field.type === 'date'"
        :model-value="modelValue[field.key]"
        :label="field.label"
        :placeholder="field.placeholder"
        @update:model-value="onChanged(field, $event)"
      />
      <AppSelect
        v-else
        :model-value="modelValue[field.key]"
        :label="field.label"
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
