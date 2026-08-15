import { reactive } from 'vue'

// A promise-based confirmation, mounted once in App.vue the same way toasts
// are. Destructive actions await it inline —
//
//   if (!(await confirm({ message: ... }))) return
//
// — so the guard reads as part of the action instead of splitting it across a
// dialog component, a flag and a callback in every view that deletes
// something.
const state = reactive({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  danger: true,
})

let resolver = null

function settle(value) {
  state.open = false
  const resolve = resolver
  resolver = null
  resolve?.(value)
}

function ask(options = {}) {
  // A second prompt opening over a pending one would strand the first
  // promise forever; the older question is answered "no" and dropped.
  if (resolver) settle(false)

  state.title = options.title ?? ''
  state.message = options.message ?? ''
  state.confirmLabel = options.confirmLabel ?? ''
  state.cancelLabel = options.cancelLabel ?? ''
  state.danger = options.danger ?? true
  state.open = true

  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function useConfirm() {
  return { state, ask, settle }
}
