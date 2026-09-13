<script setup>
/**
 * The ⚙ at the end of a table header and its "USTUNLAR" popover — the
 * list from `useTableColumns`, a drag handle and a tick box per column,
 * the first one greyed and locked. Teleported to <body> because the table
 * scrolls sideways inside an overflow container that would clip it.
 */
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps({
  // The object returned by useTableColumns().
  columns: { type: Object, required: true },
})

const { t } = useI18n()
const open = ref(false)
const gearEl = ref(null)
const at = ref({ top: 0, left: 0 })
const dragKey = ref('')

function toggleOpen() {
  open.value = !open.value
  if (!open.value) return
  const rect = gearEl.value?.getBoundingClientRect()
  if (rect) at.value = { top: rect.bottom + 6, left: rect.right }
}

function onDragStart(key, event) {
  if (key === props.columns.lockedKey.value) {
    event.preventDefault()
    return
  }
  dragKey.value = key
  event.dataTransfer.effectAllowed = 'move'
}

function onDrop(key) {
  props.columns.move(dragKey.value, key)
  dragKey.value = ''
}

function onDocumentClick(event) {
  if (open.value && !event.target.closest?.('[data-column-settings]')) open.value = false
}
function close() {
  open.value = false
}
document.addEventListener('click', onDocumentClick)
window.addEventListener('scroll', close, true)
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('scroll', close, true)
})
</script>

<template>
  <button
    ref="gearEl"
    type="button"
    data-column-settings
    class="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-default"
    :class="open ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-ink-muted hover:bg-surface-2 hover:text-ink'"
    :title="t('table.columns')"
    :aria-expanded="open"
    @click="toggleOpen"
  >
    <Icon name="settings" size="16" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      data-column-settings
      class="fixed z-50 w-[200px] -translate-x-full rounded-xl bg-surface p-2 shadow-lg ring-1 ring-border"
      :style="{ top: `${at.top}px`, left: `${at.left}px` }"
    >
      <p class="px-3 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{{ t('table.columns') }}</p>
      <ul class="space-y-0.5">
        <li
          v-for="col in columns.ordered.value"
          :key="col.key"
          :draggable="col.key !== columns.lockedKey.value"
          class="flex items-center gap-2 rounded-md px-2 py-2 text-[14px] transition-default"
          :class="[
            col.key === columns.lockedKey.value ? 'bg-surface-2 text-ink-faint' : 'text-ink hover:bg-surface-2',
            dragKey === col.key ? 'opacity-40' : '',
          ]"
          @dragstart="onDragStart(col.key, $event)"
          @dragover.prevent
          @drop.prevent="onDrop(col.key)"
          @dragend="dragKey = ''"
        >
          <Icon name="grip-vertical" size="14" class="shrink-0 text-ink-faint" :class="col.key === columns.lockedKey.value ? '' : 'cursor-grab'" />
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-border-strong accent-primary"
            :checked="columns.isShown(col.key)"
            :disabled="col.key === columns.lockedKey.value"
            @change="columns.toggle(col.key)"
          />
          <span class="truncate">{{ col.label }}</span>
        </li>
      </ul>
    </div>
  </Teleport>
</template>
