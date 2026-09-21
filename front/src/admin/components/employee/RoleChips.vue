<script setup>
/**
 * The roles a person wears, as the reference draws them (rasm): one chip
 * per role with an ×, "+ Add role" that offers what is left, and "Show
 * permissions" — a dialog with the union of everything those roles allow,
 * grouped by module. `modelValue` is the list of role names; `roles` the
 * catalogue (`rolesApi.list()`, permissions included).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabel, permissionLabel, moduleLabel } from '@/utils/roleLabel'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  roles: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  // async (name) => role | null — given by a caller who may create roles
  // (role:manage). The picker then ends with a "new role" field, so an
  // admin who needs a hat nobody has yet does not have to leave the form
  // for the roles page and come back.
  createRole: { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { t, te } = useI18n()
const adding = ref(false)
const showPermissions = ref(false)

// A custom role shows the words the admin typed (registered from the
// catalogue by rolesApi); a seeded one its translation.
function labelFor(role) {
  return roleLabel(role.name, { t, te })
}

// The "new role" field inside the picker.
const newRoleName = ref('')
const creating = ref(false)
const newRoleInput = ref(null)
const picker = ref(null)

async function createAndAdd() {
  const name = newRoleName.value.trim()
  if (!name || creating.value || !props.createRole) return
  creating.value = true
  try {
    const created = await props.createRole(name)
    // The key is the server's (KASSIR for "Kassir"), so it is the created
    // row's name that goes on the record, not what was typed.
    if (created?.name) {
      newRoleName.value = ''
      add(created.name)
    }
  } finally {
    creating.value = false
  }
}

// The picker closes on a click anywhere else — not on blur, because the
// list and the field inside it take focus in turn.
function onDocumentClick(event) {
  if (adding.value && picker.value && !picker.value.contains(event.target)) adding.value = false
}
watch(adding, (open) => {
  if (open) {
    document.addEventListener('mousedown', onDocumentClick)
    newRoleName.value = ''
  } else {
    document.removeEventListener('mousedown', onDocumentClick)
  }
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))

async function openPicker() {
  adding.value = true
  await nextTick()
  newRoleInput.value?.focus()
}

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
        {{ labelFor(role) }}
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
    </div>

    <!-- The picker: what is left to add, and — for whoever may create
         roles — a field for one that does not exist yet. -->
    <div v-if="adding" ref="picker" class="relative mt-2">
      <div class="w-72 max-w-full rounded-md border border-border-strong bg-surface shadow-lg">
        <ul class="max-h-56 overflow-y-auto py-1">
          <li v-for="role in remaining" :key="role.name">
            <button
              type="button"
              class="flex w-full items-center px-3 py-1.5 text-left text-small text-ink transition-default hover:bg-surface-hover"
              @click="add(role.name)"
            >
              {{ labelFor(role) }}
            </button>
          </li>
          <li v-if="!remaining.length" class="px-3 py-1.5 text-small text-ink-faint">{{ t('employee.access.allRolesHeld') }}</li>
        </ul>
        <!-- Not a <form>: this picker sits inside the employee form, and
             Enter in a nested form is the outer form's submit. -->
        <div v-if="createRole" class="flex items-center gap-1.5 border-t border-border p-1.5">
          <input
            ref="newRoleInput"
            v-model="newRoleName"
            type="text"
            maxlength="40"
            :placeholder="t('employee.access.newRolePlaceholder')"
            :aria-label="t('employee.access.newRole')"
            :disabled="creating"
            class="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 text-small text-ink outline-none placeholder:text-ink-faint focus:border-primary"
            @keydown.enter.prevent="createAndAdd"
          />
          <button
            type="button"
            :disabled="creating || !newRoleName.trim()"
            @click="createAndAdd"
            class="flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-small font-medium text-primary-foreground transition-default disabled:opacity-50"
          >
            <Icon name="plus" size="13" /> {{ creating ? t('employee.access.creating') : t('employee.access.create') }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-2.5 flex flex-wrap items-center gap-5 text-small">
      <button v-if="!disabled && (remaining.length || createRole) && !adding" type="button" class="flex items-center gap-1.5 text-primary hover:underline" @click="openPicker">
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
