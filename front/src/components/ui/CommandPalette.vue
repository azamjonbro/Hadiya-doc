<script setup>
/**
 * Ctrl/Cmd+K: one box that finds a course, a path, an article or a person.
 *
 * The filtering is the server's job, not this component's — what somebody
 * may find is decided by the same visibility rules the catalogs use
 * (AT-24). Anything this page did to hide a result would be a second,
 * weaker answer to that question.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { searchApi } from '@/services/search'
import { useFocusTrap } from '@/composables/useFocusTrap'
import Icon from './Icon.vue'

const { t } = useI18n()
const router = useRouter()

const open = ref(false)
const term = ref('')
const items = ref([])
const active = ref(0)
const loading = ref(false)
const input = ref(null)
const panel = ref(null)

// A combobox with a list of results, announced as one (12.4): the input
// owns the list, and `aria-activedescendant` tells a screen reader which
// row the arrow keys are on **without** moving focus off the input — which
// is what lets somebody keep typing while walking the results.
const baseId = useId()
const listId = `${baseId}-results`
const optionId = (row) => `${baseId}-option-${row.id}`
const activeId = computed(() => (flat.value[active.value] ? optionId(flat.value[active.value]) : undefined))

const typeMeta = {
  COURSE: { icon: 'book-open', labelKey: 'search.type.COURSE' },
  PATH: { icon: 'layers', labelKey: 'search.type.PATH' },
  KB: { icon: 'file-text', labelKey: 'search.type.KB' },
  USER: { icon: 'user', labelKey: 'search.type.USER' },
}

const grouped = computed(() => {
  const buckets = new Map()
  for (const item of items.value) {
    if (!buckets.has(item.type)) buckets.set(item.type, [])
    buckets.get(item.type).push(item)
  }
  return [...buckets.entries()]
})

// A flat list alongside the grouped one, so the arrow keys can walk across
// group boundaries without the template having to compute an offset.
const flat = computed(() => grouped.value.flatMap(([, rows]) => rows))

let timer = null
watch(term, (value) => {
  clearTimeout(timer)
  if (value.trim().length < 2) {
    items.value = []
    return
  }
  // Debounced: this fires on every keystroke, and each request runs a
  // visibility check per row.
  timer = setTimeout(async () => {
    loading.value = true
    try {
      const result = await searchApi.query(value.trim())
      items.value = result.items
      active.value = 0
    } catch {
      // A failed search is an empty search. There is nothing useful to say
      // about it in a palette that closes on Escape.
      items.value = []
    } finally {
      loading.value = false
    }
  }, 200)
})

function show() {
  open.value = true
  nextTick(() => input.value?.focus())
}

function hide() {
  open.value = false
  term.value = ''
  items.value = []
}

function go(item) {
  hide()
  router.push(item.url)
}

function onKeydown(event) {
  const isPaletteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
  if (isPaletteShortcut) {
    event.preventDefault()
    open.value ? hide() : show()
    return
  }
  if (!open.value) return

  if (event.key === 'Escape') hide()
  else if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(active.value + 1, Math.max(0, flat.value.length - 1))
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(0, active.value - 1)
  } else if (event.key === 'Enter' && flat.value[active.value]) {
    event.preventDefault()
    go(flat.value[active.value])
  }
}

// Tab stays inside the palette while it is open, and focus goes back to
// whatever the person was on when it closes.
useFocusTrap(panel, { isActive: () => open.value, onEscape: hide, initialFocus: () => input.value })

// The admin bar's search field opens the palette too — one search.
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('lms:search', show)
})
onUnmounted(() => {
  window.removeEventListener('lms:search', show)
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(timer)
})

defineExpose({ show })
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-default"
      enter-from-class="opacity-0"
      leave-active-class="transition-default"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
        <div class="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" aria-hidden="true" @click="hide" />

        <div
          ref="panel"
          class="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          role="dialog"
          aria-modal="true"
          :aria-label="t('search.placeholder')"
          tabindex="-1"
        >
          <div class="flex items-center gap-3 border-b border-border px-4">
            <Icon name="search" size="18" class="shrink-0 text-ink-faint" />
            <input
              ref="input"
              v-model="term"
              type="text"
              class="h-12 w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
              :placeholder="t('search.placeholder')"
              :aria-label="t('search.placeholder')"
              role="combobox"
              autocomplete="off"
              aria-autocomplete="list"
              :aria-expanded="items.length > 0"
              :aria-controls="listId"
              :aria-activedescendant="activeId"
            />
            <Icon v-if="loading" name="loader" size="16" class="shrink-0 animate-spin text-ink-faint" />
            <kbd class="shrink-0 rounded border border-border px-1.5 py-0.5 text-caption text-ink-faint">esc</kbd>
          </div>

          <div v-if="term.trim().length >= 2 && !items.length && !loading" class="px-4 py-8 text-center">
            <!-- Announced when it appears: somebody who cannot see the box
                 empty out otherwise waits for a result that is not coming. -->
            <p class="text-small text-ink-muted" role="status">{{ t('search.nothing') }}</p>
          </div>

          <div v-else-if="items.length" :id="listId" role="listbox" class="max-h-80 overflow-y-auto py-2">
            <template v-for="[type, rows] in grouped" :key="type">
              <p class="px-4 py-1.5 text-caption font-semibold uppercase tracking-widest text-ink-faint" role="presentation">
                {{ t(typeMeta[type].labelKey) }}
              </p>
              <!-- An option, not a button: focus stays on the input (see
                   `aria-activedescendant`), so these must not be in the tab
                   order themselves. -->
              <div
                v-for="row in rows"
                :id="optionId(row)"
                :key="row.id"
                role="option"
                :aria-selected="flat[active]?.id === row.id"
                class="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-default"
                :class="flat[active]?.id === row.id ? 'bg-primary-subtle' : 'hover:bg-surface-hover'"
                @click="go(row)"
                @mouseenter="active = flat.findIndex((entry) => entry.id === row.id)"
              >
                <Icon :name="typeMeta[type].icon" size="16" class="shrink-0 text-ink-faint" />
                <span class="min-w-0">
                  <span class="block truncate text-small text-ink">{{ row.title }}</span>
                  <span v-if="row.subtitle" class="block truncate text-caption text-ink-faint">{{ row.subtitle }}</span>
                </span>
              </div>
            </template>
          </div>

          <p v-else class="px-4 py-6 text-center text-caption text-ink-faint">{{ t('search.hint') }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
