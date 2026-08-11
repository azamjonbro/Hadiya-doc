import { reactive } from 'vue'

const toasts = reactive([])
let counter = 0

function push(variant, message, opts = {}) {
  const id = ++counter
  toasts.push({ id, variant, message, duration: opts.duration ?? 4200 })
  if (opts.duration !== 0) {
    setTimeout(() => dismiss(id), opts.duration ?? 4200)
  }
  return id
}

function dismiss(id) {
  const index = toasts.findIndex((t) => t.id === id)
  if (index !== -1) toasts.splice(index, 1)
}

export function useToast() {
  return {
    toasts,
    dismiss,
    success: (message, opts) => push('success', message, opts),
    error: (message, opts) => push('danger', message, opts),
    warning: (message, opts) => push('warning', message, opts),
    info: (message, opts) => push('info', message, opts),
  }
}
