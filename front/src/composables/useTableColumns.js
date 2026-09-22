import { computed, ref, unref } from 'vue'

/**
 * Which columns a table shows, and in what order (rasm 1.09: the ⚙ at the
 * end of every header — "USTUNLAR", drag to reorder, tick to show).
 *
 * `columns` is the full list `[{ key, label, … }]` (a ref, a computed or a
 * plain array); `visible` is what the table should render. The choice is
 * kept in localStorage under `table-columns:<key>`, per table. The first
 * column is locked: a table with nothing in it is not a table. A column
 * with `hidden: true` starts unticked (the long tail of an employee record
 * — rasm 1.09 offers twenty, shows five). What is stored is only what the
 * person changed, in either direction, so a column added by a later deploy
 * comes up with its own default rather than with whatever a setting saved
 * before it existed happens to say.
 */
export function useTableColumns(key, columns) {
  const storageKey = `table-columns:${key}`
  const order = ref([])
  // Columns the person turned off, and columns they turned on — anything
  // in neither follows the column's own default.
  const hidden = ref(new Set())
  const shown = ref(new Set())

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      order.value = Array.isArray(saved?.order) ? saved.order : []
      hidden.value = new Set(Array.isArray(saved?.hidden) ? saved.hidden : [])
      shown.value = new Set(Array.isArray(saved?.shown) ? saved.shown : [])
    } catch {
      order.value = []
      hidden.value = new Set()
      shown.value = new Set()
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ order: order.value, hidden: [...hidden.value], shown: [...shown.value] })
      )
    } catch {
      // A blocked store just means the choice lasts for this page.
    }
  }

  load()

  const all = computed(() => (typeof columns === 'function' ? columns() : unref(columns)) ?? [])
  const lockedKey = computed(() => all.value[0]?.key)

  /** Every column in the chosen order, the locked one first. */
  const ordered = computed(() => {
    const byKey = new Map(all.value.map((col) => [col.key, col]))
    const chosen = order.value.filter((k) => byKey.has(k)).map((k) => byKey.get(k))
    const rest = all.value.filter((col) => !order.value.includes(col.key))
    const merged = [...chosen, ...rest]
    return [...merged.filter((col) => col.key === lockedKey.value), ...merged.filter((col) => col.key !== lockedKey.value)]
  })

  function isShownCol(col) {
    if (col.key === lockedKey.value) return true
    if (hidden.value.has(col.key)) return false
    if (shown.value.has(col.key)) return true
    return !col.hidden
  }

  const visible = computed(() => ordered.value.filter(isShownCol))

  function isShown(k) {
    const col = all.value.find((c) => c.key === k)
    return col ? isShownCol(col) : false
  }

  function toggle(k) {
    if (k === lockedKey.value) return
    const nextHidden = new Set(hidden.value)
    const nextShown = new Set(shown.value)
    if (isShown(k)) {
      nextShown.delete(k)
      nextHidden.add(k)
    } else {
      nextHidden.delete(k)
      nextShown.add(k)
    }
    hidden.value = nextHidden
    shown.value = nextShown
    persist()
  }

  /** Drop `from` in front of `before`. */
  function move(from, before) {
    if (!from || from === before || before === lockedKey.value || from === lockedKey.value) return
    const keys = ordered.value.map((col) => col.key)
    keys.splice(keys.indexOf(from), 1)
    keys.splice(keys.indexOf(before), 0, from)
    order.value = keys
    persist()
  }

  return { ordered, visible, hidden, lockedKey, isShown, toggle, move }
}
