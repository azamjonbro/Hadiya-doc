<script>
import { shallowRef } from 'vue'

/**
 * The item currently being dragged, at module scope so every SortableList on
 * the page shares one.
 *
 * A column can only know what it is being handed if the column that started
 * the drag left it somewhere both can see. DataTransfer would be the tidier
 * channel — it is the one the browser provides — but it carries strings only,
 * and the item here is an object the caller owns and expects back unchanged.
 */
const inFlight = shallowRef(null)
</script>

<script setup>
import { ref } from 'vue'

/**
 * A list whose items can be dragged — within the list to reorder them, and
 * between lists sharing a `group` to move one across.
 *
 * Two screens needed this and neither could use the other's: the task board
 * wrote its own drag state for moving cards between columns, and the path
 * builder had no dragging at all, only up/down buttons — a fine fallback and
 * a poor primary, since reordering a twelve-step path meant eleven clicks.
 *
 * So both are here. `#item` gets `moveUp`/`moveDown` next to the drag
 * handling, and the buttons a caller renders with them keep working for
 * anyone not using a mouse: dragging is the shortcut, never the only way.
 *
 * Cross-list drops are announced, not applied. Which list an item belongs to
 * is usually a server-side fact — a task's status, a step's section — so this
 * emits `move` and lets the caller decide what that means. Reordering inside
 * one list is local, and does emit `update:modelValue`.
 */
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  itemKey: { type: [String, Function], default: 'id' },
  // Lists sharing a group name accept each other's items.
  group: { type: String, default: '' },
  /**
   * This list's own identity, reported as `from`/`to` on a cross-list move.
   *
   * Four board columns share one group but are four different destinations,
   * and the caller needs to know which one an item was dragged out of: moving
   * a task out of "Done" is not the same event as moving it out of "To do".
   *
   * Required whenever more than one list shares a group — it is also how a
   * list recognises its own items coming back, so two unnamed lists in one
   * group would each think the other's items were their own.
   */
  name: { type: String, default: '' },
  // Off for lists whose internal order carries no meaning — a board column.
  reorderable: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  listClass: { type: String, default: 'space-y-2' },
  overClass: { type: String, default: 'rounded-lg bg-primary-subtle/40' },
})

const emit = defineEmits(['update:modelValue', 'move', 'reorder'])

const isOver = ref(false)

// dragleave fires on the container every time the pointer crosses into one of
// its own children, so a plain boolean flickers the drop highlight on and off
// as you move over the cards. Counting enters against leaves is the standard
// answer, and the board's hand-written version had the flicker.
let depth = 0

function keyOf(item) {
  return typeof props.itemKey === 'function' ? props.itemKey(item) : item[props.itemKey]
}

function onDragEnter() {
  if (props.disabled) return
  depth += 1
  isOver.value = true
}

function onDragLeave() {
  depth -= 1
  if (depth <= 0) {
    depth = 0
    isOver.value = false
  }
}

function resetOver() {
  depth = 0
  isOver.value = false
}

function onDragStart(item, index, event) {
  if (props.disabled) return
  inFlight.value = { item, index, group: props.group, from: props.modelValue }
  // Firefox starts no drag at all unless something is put on the transfer.
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(keyOf(item)))
}

function onDragEnd() {
  inFlight.value = null
  resetOver()
}

/** `targetIndex` is the index the dragged item should end up at. */
function drop(targetIndex) {
  const flight = inFlight.value
  resetOver()
  if (!flight || props.disabled) return

  // By name first, by array identity only as the fallback for a lone unnamed
  // list. The array is a computed in at least one caller, so it is a new
  // reference every time that computed re-evaluates — comparing on it alone
  // would turn a reorder into a cross-list move at random.
  const me = props.name || props.group
  const sameList = me ? flight.name === me : flight.from === props.modelValue

  if (sameList) {
    if (!props.reorderable || targetIndex === flight.index) return
    const next = [...props.modelValue]
    const [moved] = next.splice(flight.index, 1)
    next.splice(targetIndex, 0, moved)
    emit('update:modelValue', next)
    emit('reorder', { item: moved, from: flight.index, to: targetIndex })
  } else if (flight.group && flight.group === props.group) {
    emit('move', {
      item: flight.item,
      from: flight.name,
      to: me,
      index: targetIndex,
    })
  }
  inFlight.value = null
}

function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= props.modelValue.length) return
  const next = [...props.modelValue]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  emit('update:modelValue', next)
  emit('reorder', { item, from: index, to: target })
}
</script>

<template>
  <div
    :class="[listClass, isOver ? overClass : '']"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="drop(modelValue.length)"
  >
    <div
      v-for="(item, index) in modelValue"
      :key="keyOf(item)"
      :draggable="!disabled"
      @dragstart="onDragStart(item, index, $event)"
      @dragend="onDragEnd"
      @drop.prevent.stop="drop(index)"
    >
      <slot
        name="item"
        :item="item"
        :index="index"
        :dragging="inFlight?.item === item"
        :move-up="() => move(index, -1)"
        :move-down="() => move(index, 1)"
        :is-first="index === 0"
        :is-last="index === modelValue.length - 1"
      />
    </div>

    <slot v-if="modelValue.length === 0" name="empty" />
  </div>
</template>
