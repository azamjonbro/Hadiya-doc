// 12.4 — the focus trap, exercised as a keyboard actually exercises it.
//
// This is the part of accessibility axe cannot see: axe reads the markup a
// dialog produces, not what happens when somebody presses Tab in it. Each
// case below is a way the old dialogs failed a keyboard user — Tab walking
// out into the page behind, Escape doing nothing, focus landing back at the
// top of the document after the dialog closed.
//
// The composable is plain JavaScript, so it runs against jsdom directly,
// with a real (tiny) Vue component driving it exactly as Modal does.

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

let dom
let createApp
let h
let ref
let nextTick
let useFocusTrap
let focusableWithin

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  global.window = dom.window
  global.document = dom.window.document
  // Vue's runtime-dom checks against these constructors while it patches
  // the DOM, and reads them off the global scope rather than off `window`.
  for (const name of [
    'Node',
    'Element',
    'HTMLElement',
    'SVGElement',
    'MathMLElement',
    'Text',
    'Comment',
    'DocumentFragment',
    'Event',
    'CustomEvent',
    'KeyboardEvent',
    'MouseEvent',
    'getComputedStyle',
  ]) {
    global[name] = dom.window[name]
  }
  // Imported only now, so they see the DOM above.
  ;({ createApp, h, ref, nextTick } = await import('vue'))
  ;({ useFocusTrap, focusableWithin } = await import('../src/composables/useFocusTrap.js'))
})

after(() => dom?.window.close())

/**
 * A dialog with three buttons in it, mounted the way Modal mounts: a panel
 * that only exists while `open` is true.
 */
function mountDialog({ onEscape } = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const open = ref(false)
  const panel = ref(null)

  const app = createApp({
    setup() {
      useFocusTrap(panel, { isActive: () => open.value, onEscape })
      return () =>
        open.value
          ? h('div', { ref: panel, tabindex: '-1', 'data-panel': '' }, [
              h('button', { id: 'first' }, 'first'),
              h('button', { id: 'middle' }, 'middle'),
              h('button', { id: 'last' }, 'last'),
            ])
          : null
    },
  })
  app.mount(host)
  return { open, panel, host, unmount: () => app.unmount() }
}

function press(key, { shiftKey = false } = {}) {
  const event = new dom.window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('12.4 · the focus trap', () => {
  test('opening moves focus into the dialog', async () => {
    const dialog = mountDialog()
    dialog.open.value = true
    await nextTick()
    await nextTick()
    assert.equal(document.activeElement.id, 'first')
    dialog.unmount()
  })

  test('Tab from the last control wraps to the first, and back', async () => {
    const dialog = mountDialog()
    dialog.open.value = true
    await nextTick()
    await nextTick()

    document.getElementById('last').focus()
    const forward = press('Tab')
    assert.equal(document.activeElement.id, 'first')
    // Prevented, or the browser would move focus a second time — out of
    // the dialog, which is the bug this whole file is about.
    assert.equal(forward.defaultPrevented, true)

    const back = press('Tab', { shiftKey: true })
    assert.equal(document.activeElement.id, 'last')
    assert.equal(back.defaultPrevented, true)
    dialog.unmount()
  })

  test('focus that escapes some other way is pulled back', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const dialog = mountDialog()
    dialog.open.value = true
    await nextTick()
    await nextTick()

    // Not a Tab: a script, a click on the backdrop, the browser handing
    // focus back after the window was re-activated.
    outside.focus()
    assert.equal(document.activeElement.id, 'first')
    dialog.unmount()
  })

  test('Escape closes — but only for a dialog that asked to handle it', async () => {
    // A listener in the bubble phase, standing in for the layer underneath:
    // the dialog below in a stack, or a view's own Escape shortcut.
    let underneath = 0
    const listener = (event) => {
      if (event.key === 'Escape') underneath += 1
    }
    document.addEventListener('keydown', listener)

    let closed = 0
    const withEscape = mountDialog({ onEscape: () => (closed += 1) })
    withEscape.open.value = true
    await nextTick()
    await nextTick()
    press('Escape')
    assert.equal(closed, 1)
    // One Escape closes one layer: the key does not travel on.
    assert.equal(underneath, 0)
    withEscape.unmount()

    // The material viewer passes no `onEscape` because its own handler has
    // to leave full screen first — so the key must reach it untouched.
    const withoutEscape = mountDialog()
    withoutEscape.open.value = true
    await nextTick()
    await nextTick()
    press('Escape')
    assert.equal(underneath, 1, 'a trap with no onEscape must let the key through')
    withoutEscape.unmount()
    document.removeEventListener('keydown', listener)
  })

  test('closing puts focus back where it was', async () => {
    const trigger = document.createElement('button')
    trigger.id = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    const dialog = mountDialog()
    dialog.open.value = true
    await nextTick()
    await nextTick()
    assert.equal(document.activeElement.id, 'first')

    dialog.open.value = false
    await nextTick()
    assert.equal(document.activeElement.id, 'trigger', 'focus goes back to the control that opened the dialog')
    dialog.unmount()
  })

  test('the page behind cannot scroll, and nested dialogs share one lock', async () => {
    const outer = mountDialog()
    outer.open.value = true
    await nextTick()
    await nextTick()
    assert.equal(document.body.style.overflow, 'hidden')

    const inner = mountDialog()
    inner.open.value = true
    await nextTick()
    await nextTick()
    inner.open.value = false
    await nextTick()
    // The confirm on top closed; the drawer under it is still open.
    assert.equal(document.body.style.overflow, 'hidden')

    outer.open.value = false
    await nextTick()
    assert.equal(document.body.style.overflow, '')
    outer.unmount()
    inner.unmount()
  })

  test('a dialog unmounted while open does not leave the page locked', async () => {
    const dialog = mountDialog()
    dialog.open.value = true
    await nextTick()
    await nextTick()
    assert.equal(document.body.style.overflow, 'hidden')
    // The route changed under an open dialog.
    dialog.unmount()
    await nextTick()
    assert.equal(document.body.style.overflow, '')
  })

  test('hidden controls are not part of the cycle', async () => {
    const panel = document.createElement('div')
    panel.innerHTML = `
      <button id="visible">ok</button>
      <button id="gone" style="display: none">gone</button>
      <button id="collapsed" hidden>collapsed</button>
      <button id="disabled" disabled>disabled</button>
    `
    document.body.appendChild(panel)
    const ids = focusableWithin(panel).map((el) => el.id)
    assert.deepEqual(ids, ['visible'])
  })
})
