<script setup>
/**
 * A single-choice picker whose list the admin edits in place: type a name that
 * does not exist yet and it is created, or hit the bin next to one nobody uses
 * and it is gone. Roles, job titles, departments, subdivisions and countries
 * all work this way — an admin filling in an employee should not have to leave
 * the form, go find a settings page, and come back.
 *
 * Creating and deleting are handed back to the caller as async props rather
 * than events, because both are API calls whose result decides what happens
 * next here: a created entry gets selected once the server has actually taken
 * it, and a refused delete (the last person in that department is still in it)
 * leaves the list exactly as it was.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // { value, label, deletable?, count? }
  options: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  // async (name) => boolean — resolve true when the entry now exists.
  createEntry: { type: Function, default: null },
  // async (option) => boolean — resolve true when it is gone.
  removeEntry: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const open = ref(false)
const query = ref('')
const busy = ref(false)
const root = ref(null)
const searchInput = ref(null)

// Whatever is selected stays on the list even if it is not in `options` — an
// employee filed under a department that was later renamed must still show the
// value on their record rather than an empty box.
const allOptions = computed(() => {
  const known = props.options.slice()
  if (props.modelValue && !known.some((o) => o.value === props.modelValue)) {
    known.unshift({ value: props.modelValue, label: props.modelValue, deletable: false })
  }
  return known
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allOptions.value
  return allOptions.value.filter((o) => o.label.toLowerCase().includes(q))
})

// Only offer to create a genuinely new name, case-insensitively: "Sotuvchi"
// and "sotuvchi" must not become two entries that each filter out the other's
// people.
const creatable = computed(() => {
  if (!props.createEntry) return ''
  const value = query.value.trim()
  if (!value) return ''
  return allOptions.value.some((o) => o.label.toLowerCase() === value.toLowerCase()) ? '' : value
})

const triggerLabel = computed(() => props.modelValue || props.placeholder || t('orgLists.select'))

function choose(value) {
  emit('update:modelValue', value === props.modelValue ? '' : value)
  close()
}

async function onCreate() {
  const name = creatable.value
  if (!name || busy.value) return
  busy.value = true
  try {
    const created = await props.createEntry(name)
    // The server normalises names (a role becomes SHIFT_LEAD, not "shift
    // lead"), so select by what came back rather than by what was typed.
    if (created) emit('update:modelValue', typeof created === 'string' ? created : name)
    if (created) close()
  } finally {
    busy.value = false
  }
}

async function onRemove(option) {
  if (!props.removeEntry || busy.value) return
  busy.value = true
  try {
    const removed = await props.removeEntry(option)
    // Clearing the field it was selected in is the honest follow-up: the value
    // no longer exists, and leaving it on screen would save a dangling name.
    if (removed && props.modelValue === option.value) emit('update:modelValue', '')
  } finally {
    busy.value = false
  }
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
      <span class="truncate" :class="modelValue ? 'text-ink' : 'text-ink-faint'">{{ triggerLabel }}</span>
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
            :placeholder="createEntry ? t('orgLists.searchOrCreate') : t('orgLists.search')"
            class="h-8 w-full rounded border border-border bg-surface-2 pl-7 pr-2 text-small text-ink outline-none focus:border-primary"
            @keydown.esc.stop="close"
            @keydown.enter.prevent="creatable ? onCreate() : filtered[0] && choose(filtered[0].value)"
          />
        </div>
      </div>

      <div class="max-h-56 overflow-y-auto py-1">
        <button
          v-if="creatable"
          type="button"
          :disabled="busy"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-primary hover:bg-surface-2 disabled:opacity-60"
          @click="onCreate"
        >
          <Icon name="plus" size="14" />
          <span class="truncate">{{ t('orgLists.create', { name: creatable }) }}</span>
        </button>

        <div
          v-for="option in filtered"
          :key="option.value"
          class="group flex items-center gap-1 pr-1 hover:bg-surface-2"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-small text-ink"
            @click="choose(option.value)"
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
              :class="option.value === modelValue ? 'border-primary bg-primary text-white' : 'border-border-strong'"
            >
              <Icon v-if="option.value === modelValue" name="check" size="11" />
            </span>
            <span class="truncate">{{ option.label }}</span>
          </button>

          <!-- Only for entries the server would actually let go: built-in
               roles and anything still on someone's record keep no bin, so the
               button never promises something that comes back a 409. -->
          <button
            v-if="removeEntry && option.deletable"
            type="button"
            :disabled="busy"
            class="rounded p-1.5 text-ink-faint opacity-0 transition-default hover:bg-danger-subtle hover:text-danger group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
            :title="t('orgLists.remove')"
            @click.stop="onRemove(option)"
          >
            <Icon name="trash" size="14" />
          </button>
        </div>

        <p v-if="!filtered.length && !creatable" class="px-3 py-3 text-center text-caption text-ink-faint">
          {{ t('orgLists.empty') }}
        </p>
      </div>
    </div>
  </div>
</template>
