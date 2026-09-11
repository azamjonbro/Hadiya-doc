<script setup>
import { computed } from 'vue'
import Skeleton from './Skeleton.vue'
import EmptyState from './EmptyState.vue'
import Icon from './Icon.vue'

/**
 * The admin table shell: the frame, the header row, the loading skeleton, the
 * tick boxes and the empty state.
 *
 * Six screens had drawn all of that by hand, character for character — which
 * is why the audit log's skeleton had eight rows and the user list's had six,
 * and why a table added later kept forgetting the empty state entirely. What
 * differs between those screens is the columns and what goes in a cell, so
 * that is all a caller passes: a column list, and a `cell-<key>` slot for any
 * column that is more than text.
 *
 * Selection is a Set of row keys under `v-model:selected`, not a flag on each
 * row: the row objects come from the API and must stay exactly what the API
 * returned, and "which rows are ticked" is the screen's state, not the data's.
 */
const props = defineProps({
  // [{ key, label, width, align, cellClass, headClass, skeletonWidth }]
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  /**
   * A column name, or a function `(row, index) => key`.
   *
   * Falls back to the row's position when neither yields anything. Report
   * rows are the case that needs it: they are aggregation output with no id
   * of their own, and without the fallback every row keyed as `undefined`
   * and Vue reused one DOM row for the whole table.
   */
  rowKey: { type: [String, Function], default: 'id' },
  loading: { type: Boolean, default: false },
  skeletonRows: { type: Number, default: 6 },
  selectable: { type: Boolean, default: false },
  selected: { type: Set, default: () => new Set() },
  clickableRows: { type: Boolean, default: false },
  // The trailing "there is more behind this row" chevron.
  chevron: { type: Boolean, default: false },
  emptyIcon: { type: String, default: 'layers' },
  emptyTitle: { type: String, default: '' },
  emptyDescription: { type: String, default: '' },
})

const emit = defineEmits(['update:selected', 'row-click'])

function keyOf(row, index) {
  const key = typeof props.rowKey === 'function' ? props.rowKey(row, index) : row[props.rowKey]
  return key ?? index
}

const allSelected = computed(
  () => props.rows.length > 0 && props.rows.every((row, index) => props.selected.has(keyOf(row, index)))
)

function toggleAll() {
  emit(
    'update:selected',
    allSelected.value ? new Set() : new Set(props.rows.map((row, index) => keyOf(row, index)))
  )
}

// A new Set each time rather than mutating: Vue does not track adds and
// deletes on a Set held in a ref, so mutating it in place updates nothing.
function toggleOne(row, index) {
  const next = new Set(props.selected)
  const key = keyOf(row, index)
  next.has(key) ? next.delete(key) : next.add(key)
  emit('update:selected', next)
}

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }
</script>

<template>
  <!-- Flat (rasn 6, 8–10): rules between rows, a 13px grey header, 56px
       rows — the table sits on the page card, not in a box of its own -->
  <div class="overflow-x-auto">
    <table class="w-full text-left">
      <thead>
        <tr class="h-11 border-b border-border text-[13px] text-ink-muted">
          <th v-if="selectable" class="w-10 px-4 py-3">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-border-strong"
              :checked="allSelected"
              :disabled="rows.length === 0"
              @change="toggleAll"
            />
          </th>
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3"
            :class="[col.width, col.headClass, alignClass[col.align ?? 'left']]"
          >
            <slot :name="`head-${col.key}`" :column="col">{{ col.label }}</slot>
          </th>
          <th v-if="chevron" class="w-10 px-4 py-3" />
        </tr>
      </thead>

      <tbody>
        <!-- Skeleton rows keep the column count, so the header does not jump
             sideways when the real rows arrive. -->
        <template v-if="loading">
          <tr v-for="i in skeletonRows" :key="`skeleton-${i}`" class="border-b border-border last:border-0">
            <td v-if="selectable" class="px-4 py-3"><Skeleton class="h-4 w-4" /></td>
            <td v-for="col in columns" :key="col.key" class="px-4 py-3">
              <Skeleton class="h-4" :class="col.skeletonWidth ?? 'w-24'" />
            </td>
            <td v-if="chevron" class="px-4 py-3" />
          </tr>
        </template>

        <tr
          v-for="(row, index) in rows"
          :key="keyOf(row, index)"
          class="h-14 border-b border-border text-[14px] transition-default last:border-0 hover:bg-surface-2"
          :class="clickableRows ? 'cursor-pointer' : ''"
          @click="clickableRows && emit('row-click', row)"
        >
          <!-- click.stop, or ticking a box would also open the row. -->
          <td v-if="selectable" class="px-4 py-3" @click.stop>
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-border-strong"
              :checked="selected.has(keyOf(row, index))"
              @change="toggleOne(row, index)"
            />
          </td>
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3"
            :class="[col.cellClass, alignClass[col.align ?? 'left']]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]" :index="index">
              {{ row[col.key] || '—' }}
            </slot>
          </td>
          <td v-if="chevron" class="px-4 py-3 text-ink-faint"><Icon name="chevron-right" size="15" /></td>
        </tr>
      </tbody>
    </table>

    <!-- Only once loading is over: an empty table mid-fetch is not empty, it
         is unknown, and saying "nothing here" about it reads as an answer. -->
    <slot v-if="!loading && rows.length === 0" name="empty">
      <EmptyState :icon="emptyIcon" :title="emptyTitle" :description="emptyDescription" />
    </slot>
  </div>
</template>
