import { onBeforeUnmount, onMounted } from 'vue'

export function onClickOutside(elRef, handler) {
  function listener(event) {
    const el = elRef.value
    if (!el || el.contains(event.target)) return
    handler(event)
  }
  onMounted(() => document.addEventListener('mousedown', listener))
  onBeforeUnmount(() => document.removeEventListener('mousedown', listener))
}
