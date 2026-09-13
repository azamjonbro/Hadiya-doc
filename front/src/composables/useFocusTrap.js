/**
 * Keyboard focus, for the things that cover the page (12.4).
 *
 * A dialog that only *looks* modal is the classic keyboard trap in
 * reverse: the overlay is drawn on top, but Tab keeps walking the page
 * behind it. Somebody using a keyboard or a screen reader ends up typing
 * into a form they cannot see, or "closes" a dialog by tabbing away from
 * it and leaving it open. This is the shared answer for Modal, Drawer,
 * the command palette and the material viewer, rather than four
 * near-identical fixes with four sets of bugs.
 *
 * What it does, in the order it matters:
 *   1. moves focus **into** the dialog when it opens (the panel itself if
 *      nothing inside is focusable yet — a lazily-loaded body),
 *   2. keeps Tab and Shift+Tab inside it,
 *   3. closes on Escape,
 *   4. puts focus **back** on whatever opened it, so the person is
 *      returned to their place in the page instead of the top of it,
 *   5. stops the page behind from scrolling while it is open.
 *
 * The focus is re-checked on `focusin` rather than only on Tab: focus can
 * also move by a click on the backdrop, by a script, or by the browser
 * restoring it after the window is re-activated.
 */
import { nextTick, onBeforeUnmount, watch } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

// Nested dialogs (a confirm on top of a drawer) share one lock, so the
// inner one closing does not hand scrolling back to the page while the
// outer one is still open.
let scrollLocks = 0
let previousOverflow = ''

// The open traps, bottom to top. Only the topmost one may pull focus or
// answer Tab/Escape: with two active at once (a confirm over an editor
// dialog) each saw the other's panel as "outside", and the two `focusin`
// handlers took turns dragging focus back — a loop that, depending on the
// browser, froze the page or left the confirm's buttons unreachable.
const stack = []
const isTop = (trap) => stack[stack.length - 1] === trap

function lockScroll() {
  if (typeof document === 'undefined') return
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLocks += 1
}

function unlockScroll() {
  if (typeof document === 'undefined' || scrollLocks === 0) return
  scrollLocks -= 1
  if (scrollLocks === 0) document.body.style.overflow = previousOverflow
}

/**
 * Hidden the way the tab order means it: a collapsed section's controls
 * must stay out of the cycle.
 *
 * Deliberately not `offsetParent === null`, the usual shorthand: it is also
 * null for a `position: fixed` element — which every dialog here is — and
 * it is null for *everything* in a document with no layout, which is what a
 * test environment gives you. Both make the check answer "hidden" for
 * things that are on screen.
 */
function isHidden(el) {
  if (el.hasAttribute('hidden') || el.closest('[hidden]')) return true
  if (el.getAttribute('aria-hidden') === 'true') return true
  const style = el.ownerDocument.defaultView?.getComputedStyle?.(el)
  return style ? style.display === 'none' || style.visibility === 'hidden' : false
}

export function focusableWithin(container) {
  if (!container) return []
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => !isHidden(el))
}

/**
 * @param {import('vue').Ref<HTMLElement|null>} containerRef the dialog panel
 * @param {object} options
 * @param {() => boolean} options.isActive whether the dialog is open
 * @param {() => void} [options.onEscape] called on Escape (usually "close")
 * @param {() => HTMLElement|null} [options.initialFocus] what to focus first
 */
export function useFocusTrap(containerRef, { isActive, onEscape, initialFocus } = {}) {
  let restoreTo = null
  let trapped = false

  function onKeydown(event) {
    if (!isTop(self)) return
    if (event.key === 'Escape') {
      // Only when this dialog asked for it. A component with its own
      // Escape handling (the material viewer leaves full screen first)
      // passes no `onEscape`, and must still see the key.
      if (!onEscape) return
      // `stopPropagation`, so one Escape closes one layer: without it a
      // confirm inside a drawer would close both at once.
      event.stopPropagation()
      onEscape()
      return
    }
    if (event.key !== 'Tab') return

    const container = containerRef.value
    if (!container) return
    const items = focusableWithin(container)
    if (!items.length) {
      // Nothing to move between — keep focus on the panel rather than
      // letting Tab walk out into the page behind.
      event.preventDefault()
      container.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function onFocusIn(event) {
    if (!isTop(self)) return
    const container = containerRef.value
    if (!container || container.contains(event.target)) return
    // Focus left the dialog some other way (a click on the backdrop, a
    // script, the browser handing focus back to the document). Pull it to
    // the first control rather than to the panel, so the next Tab
    // continues from a sensible place.
    const items = focusableWithin(container)
    ;(items[0] ?? container).focus()
  }

  const self = {}

  async function activate() {
    if (trapped) return
    trapped = true
    stack.push(self)
    restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockScroll()
    document.addEventListener('keydown', onKeydown, true)
    document.addEventListener('focusin', onFocusIn, true)
    // The panel is rendered by a `v-if` inside a Transition, so it does
    // not exist yet on the tick the flag flips.
    await nextTick()
    const container = containerRef.value
    if (!container) return
    const target = initialFocus?.() ?? focusableWithin(container)[0] ?? container
    target.focus()
  }

  function deactivate() {
    if (!trapped) return
    trapped = false
    const at = stack.indexOf(self)
    if (at !== -1) stack.splice(at, 1)
    document.removeEventListener('keydown', onKeydown, true)
    document.removeEventListener('focusin', onFocusIn, true)
    unlockScroll()
    // Only if it is still there: the trigger may have been a row in a
    // table the dialog just deleted.
    if (restoreTo?.isConnected) restoreTo.focus()
    restoreTo = null
  }

  watch(
    isActive,
    (open) => {
      if (open) activate()
      else deactivate()
    },
    { immediate: true }
  )

  // A dialog can be unmounted while open (the route changes under it);
  // without this the page keeps a scroll lock and two live listeners.
  onBeforeUnmount(deactivate)

  return { activate, deactivate }
}
