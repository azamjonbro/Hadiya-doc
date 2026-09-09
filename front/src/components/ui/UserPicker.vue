<script setup>
import { ref, watch } from 'vue'
import AppInput from './AppInput.vue'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import { usersApi } from '@/services/users'

/**
 * Type a name, pick a colleague.
 *
 * Six screens had written this: a text box, a `usersApi.list({ search, limit:
 * 5 })` on every keystroke, an absolutely positioned <ul>, and a pick handler
 * that copies the name into the box and empties the results. They differed
 * only in which of them remembered to close the list on blur (two) and which
 * offered a way to clear the choice (one).
 *
 * Two things this adds that none of them had: the request is debounced, so
 * typing a nine-letter name is one search and not nine; and the answer to a
 * search that was superseded while in flight is thrown away, which is what
 * used to make the list flicker back to an earlier query's results.
 */
const props = defineProps({
  // The chosen user's id.
  modelValue: { type: String, default: '' },
  // The chosen user's name, when the caller knows it — restoring a saved
  // filter, say, without a round trip to look the name up again.
  displayName: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  limit: { type: Number, default: 5 },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'select', 'clear'])

const query = ref(props.displayName)
const results = ref([])
const open = ref(false)
const searching = ref(false)

let debounce = null
// Only the newest search may write to `results`; anything older lost its race
// and its answer is stale by definition.
let latest = 0

watch(
  () => props.displayName,
  (name) => {
    if (name !== query.value) query.value = name
  }
)

async function run(term) {
  const ticket = (latest += 1)
  searching.value = true
  try {
    const { items } = await usersApi.list({ search: term, limit: props.limit })
    if (ticket !== latest) return
    results.value = items
    open.value = items.length > 0
  } catch {
    if (ticket === latest) results.value = []
  } finally {
    if (ticket === latest) searching.value = false
  }
}

function onInput(value) {
  query.value = value
  // Typing past a chosen person un-chooses them: the box no longer shows who
  // is selected, and a hidden id that disagrees with the visible text is the
  // bug every one of these copies had.
  if (props.modelValue) emit('update:modelValue', '')
  clearTimeout(debounce)
  if (!value) {
    latest += 1
    results.value = []
    open.value = false
    return
  }
  debounce = setTimeout(() => run(value), 250)
}

function pick(user) {
  query.value = user.fullName
  results.value = []
  open.value = false
  emit('update:modelValue', user.id)
  emit('select', user)
}

function clear() {
  query.value = ''
  results.value = []
  open.value = false
  emit('update:modelValue', '')
  emit('clear')
}

// mousedown.prevent on a result means picking never moves focus, so this
// only runs when focus really leaves — the delay is there for the browsers
// that report focusout before the click has been dispatched.
function onBlur() {
  setTimeout(() => {
    open.value = false
  }, 120)
}
</script>

<template>
  <!-- focusin/focusout, not focus/blur: AppInput's root is the wrapping div,
       so a fallthrough focus listener lands there and never fires — focus
       does not bubble, and its -in/-out twins are the pair that does. -->
  <div class="relative" @focusin="open = results.length > 0" @focusout="onBlur">
    <AppInput
      :model-value="query"
      icon="search"
      :label="label"
      :placeholder="placeholder"
      :disabled="disabled"
      @update:model-value="onInput"
    >
      <template v-if="clearable && (modelValue || query) && !disabled" #suffix>
        <button
          type="button"
          class="rounded p-1 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
          @click="clear"
        >
          <Icon name="close" size="14" />
        </button>
      </template>
    </AppInput>

    <ul
      v-if="open && results.length"
      class="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface text-small shadow-md"
    >
      <li
        v-for="user in results"
        :key="user.id"
        class="flex cursor-pointer items-center gap-2 px-3 py-2 transition-default hover:bg-surface-2"
        @mousedown.prevent="pick(user)"
      >
        <Avatar :name="user.fullName" :src="user.avatar" size="xs" />
        <span class="min-w-0 flex-1 truncate text-ink">{{ user.fullName }}</span>
        <span class="shrink-0 text-caption text-ink-faint">{{ user.jshshir }}</span>
      </li>
    </ul>
  </div>
</template>
