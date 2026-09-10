<script setup>
// Branch picker for the two places a branch is chosen: one branch on a user,
// several on a course's targeting. A native <select> covers neither well — it
// cannot show multiple chips, and it cannot create the first branch, which a
// brand-new company always has to do before any of this means anything.
//
// Values are the branch names themselves (not ids): they are what User.branch
// and Course.branches store, and what the visibility check compares.
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps({
  // String in single mode, array of strings when `multiple`.
  modelValue: { type: [String, Array], default: '' },
  options: { type: Array, default: () => [] }, // plain strings
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
  // Filters pick from what exists; forms may need to name a new branch.
  allowCreate: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const open = ref(false)
const query = ref('')
const root = ref(null)
const searchInput = ref(null)

const selected = computed(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : []
  return props.modelValue ? [props.modelValue] : []
})

// Known branches plus anything already selected — a course keeps targeting a
// branch even after the last user in it moves away, and that value must stay
// visible here instead of silently vanishing from the list.
const allOptions = computed(() => {
  const set = new Set([...props.options, ...selected.value].filter(Boolean))
  return [...set].sort((a, b) => a.localeCompare(b))
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allOptions.value
  return allOptions.value.filter((o) => o.toLowerCase().includes(q))
})

// Only offer creation for a genuinely new name — case-insensitively, since
// "Toshkent" and "toshkent" would otherwise become two branches that hide
// courses from each other.
const creatable = computed(() => {
  if (!props.allowCreate) return ''
  const value = query.value.trim()
  if (!value) return ''
  const exists = allOptions.value.some((o) => o.toLowerCase() === value.toLowerCase())
  return exists ? '' : value
})

const triggerLabel = computed(() => {
  if (!selected.value.length) return props.placeholder || t('branches.selectPlaceholder')
  if (!props.multiple) return selected.value[0]
  return ''
})

function isSelected(name) {
  return selected.value.includes(name)
}

function choose(name) {
  if (props.multiple) {
    const next = isSelected(name) ? selected.value.filter((v) => v !== name) : [...selected.value, name]
    emit('update:modelValue', next)
  } else {
    emit('update:modelValue', isSelected(name) ? '' : name)
    close()
  }
  query.value = ''
}

function remove(name) {
  if (props.multiple) emit('update:modelValue', selected.value.filter((v) => v !== name))
  else emit('update:modelValue', '')
}

function clearAll() {
  emit('update:modelValue', props.multiple ? [] : '')
}

async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}

function close() {
  open.value = false
  query.value = ''
}

function onDocumentPointerDown(event) {
  if (root.value && !root.value.contains(event.target)) close()
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocumentPointerDown)
  else document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div ref="root" class="relative">
    <label v-if="label" class="mb-1.5 block text-small font-medium text-ink">{{ label }}</label>

    <button
      type="button"
      :disabled="disabled"
      class="flex h-10.5 w-full items-center gap-2 rounded-md border border-border-strong bg-surface pl-3.5 pr-9 text-left text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
      @click="toggle"
    >
      <template v-if="multiple && selected.length">
        <span class="flex flex-wrap items-center gap-1 overflow-hidden">
          <span
            v-for="name in selected"
            :key="name"
            class="inline-flex max-w-40 items-center gap-1 truncate rounded border border-primary/30 bg-primary-subtle px-1.5 py-0.5 text-caption text-primary"
          >
            {{ name }}
            <Icon name="close" size="12" class="shrink-0 opacity-70 hover:opacity-100" @click.stop="remove(name)" />
          </span>
        </span>
      </template>
      <span v-else class="truncate" :class="selected.length ? 'text-ink' : 'text-ink-faint'">{{ triggerLabel }}</span>
      <Icon name="chevron-down" size="16" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
    </button>

    <div
      v-if="open"
      class="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border-strong bg-surface shadow-lg"
    >
      <div class="border-b border-border p-2">
        <div class="relative">
          <Icon name="search" size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            ref="searchInput"
            v-model="query"
            type="text"
            :placeholder="allowCreate ? t('branches.searchOrCreate') : t('branches.search')"
            class="h-8 w-full rounded border border-border bg-surface-2 pl-7 pr-2 text-small text-ink outline-none focus:border-primary"
            @keydown.esc.stop="close"
            @keydown.enter.prevent="creatable ? choose(creatable) : filtered[0] && choose(filtered[0])"
          />
        </div>
      </div>

      <div class="max-h-56 overflow-y-auto py-1">
        <button
          v-if="creatable"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-primary hover:bg-surface-2"
          @click="choose(creatable)"
        >
          <Icon name="plus" size="14" />
          <span class="truncate">{{ t('branches.create', { name: creatable }) }}</span>
        </button>

        <button
          v-for="name in filtered"
          :key="name"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
          @click="choose(name)"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
            :class="isSelected(name) ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'"
          >
            <Icon v-if="isSelected(name)" name="check" size="11" />
          </span>
          <span class="truncate">{{ name }}</span>
        </button>

        <p v-if="!filtered.length && !creatable" class="px-3 py-3 text-center text-caption text-ink-faint">
          {{ t('branches.empty') }}
        </p>
      </div>

      <div v-if="selected.length" class="border-t border-border p-2">
        <button type="button" class="text-caption text-ink-muted hover:text-ink" @click="clearAll">
          {{ t('branches.clear') }}
        </button>
      </div>
    </div>
  </div>
</template>
