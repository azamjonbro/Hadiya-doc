<script setup>
/**
 * The roles a person wears, as the reference draws them (rasm): one chip
 * per role with an ×, "+ Add role" that offers what is left, and "Show
 * permissions" — a dialog with the union of everything those roles allow,
 * grouped by module. `modelValue` is the list of role names; `roles` the
 * catalogue (`rolesApi.list()`, permissions included).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabel, permissionLabel, moduleLabel } from '@/utils/roleLabel'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  roles: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t, te } = useI18n()
const adding = ref(false)
const showPermissions = ref(false)

const held = computed(() => props.modelValue.map((name) => props.roles.find((r) => r.name === name) ?? { name, permissions: [] }))
const remaining = computed(() => props.roles.filter((r) => !props.modelValue.includes(r.name)))

const grouped = computed(() => {
  const byModule = new Map()
  for (const key of new Set(held.value.flatMap((r) => r.permissions ?? []))) {
    const module = key.split(':')[0]
    if (!byModule.has(module)) byModule.set(module, [])
    byModule.get(module).push(key)
  }
  return [...byModule.entries()].map(([module, keys]) => ({ module, keys }))
})

function add(name) {
  adding.value = false
  if (!name || props.modelValue.includes(name)) return
  emit('update:modelValue', [...props.modelValue, name])
}
// The last hat stays on: an account with no role cannot sign in.
function remove(name) {
  if (props.modelValue.length <= 1) return
  emit('update:modelValue', props.modelValue.filter((n) => n !== name))
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-2">
      <span
        v-for="role in held"
        :key="role.name"
        class="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 pl-3 text-small text-ink"
        :class="disabled || modelValue.length <= 1 ? 'pr-3' : 'pr-1.5'"
      >
        {{ roleLabel(role.name, { t, te }) }}
        <button
          v-if="!disabled && modelValue.length > 1"
          type="button"
          class="flex h-5 w-5 items-center justify-center rounded-full text-ink-faint transition-default hover:bg-surface-hover hover:text-danger"
          :aria-label="t('common.delete')"
          @click="remove(role.name)"
        >
          <Icon name="close" size="12" />
        </button>
      </span>
      <select
        v-if="adding"
        class="h-8 rounded-md border border-border-strong bg-surface px-2 text-small text-ink outline-none"
        autofocus
        @change="add($event.target.value)"
        @blur="adding = false"
      >
        <option value="">{{ t('common.select') }}</option>
        <option v-for="role in remaining" :key="role.name" :value="role.name">{{ roleLabel(role.name, { t, te }) }}</option>
      </select>
    </div>

    <div class="mt-2.5 flex flex-wrap items-center gap-5 text-small">
      <button v-if="!disabled && remaining.length" type="button" class="flex items-center gap-1.5 text-primary hover:underline" @click="adding = true">
        <Icon name="plus" size="14" /> {{ t('employee.access.addRole') }}
      </button>
      <button type="button" class="flex items-center gap-1.5 text-ink-muted hover:text-ink" @click="showPermissions = true">
        <Icon name="eye" size="14" /> {{ t('employee.access.showPermissions') }}
      </button>
    </div>

    <Modal :model-value="showPermissions" :title="t('employee.access.permissionsTitle')" @update:model-value="showPermissions = $event">
      <div v-if="grouped.length" class="space-y-4">
        <div v-for="group in grouped" :key="group.module">
          <p class="mb-1 text-caption font-semibold uppercase tracking-wide text-ink-muted">{{ moduleLabel(group.module, { t, te }) }}</p>
          <ul class="space-y-0.5">
            <li v-for="key in group.keys" :key="key" class="flex items-center gap-2 text-small text-ink" :title="key">
              <span class="text-ink-faint">–</span> {{ permissionLabel(key, { t, te }) }}
            </li>
          </ul>
        </div>
      </div>
      <p v-else class="text-small text-ink-faint">{{ t('employee.access.noPermissions') }}</p>
      <template #footer>
        <AppButton variant="ghost" @click="showPermissions = false">{{ t('common.close') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
