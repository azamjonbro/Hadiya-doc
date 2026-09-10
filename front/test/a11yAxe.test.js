// 12.4 — axe, against the components this app actually renders.
//
// The rule set is the machine-checkable half of accessibility: a control
// with no accessible name, an `aria-*` that points at nothing, a role with
// its required attributes missing. It cannot tell whether a label is a
// *good* label — but every finding it does report is a real defect, and the
// point of running it here is that the next person to change these
// components hears about it before a user does.
//
// How it renders: vite loads the real .vue files (aliases, plugins and all)
// and Vue's SSR renderer turns them into HTML, which is parsed by jsdom for
// axe to walk. That keeps the test honest — it audits the components as
// they are written, not a hand-copied fixture of them — without a browser
// in the loop.
//
// `color-contrast` is switched off deliberately: jsdom has no stylesheet,
// so axe would either skip it or answer from an empty page. The palette is
// measured for real in a11yContrast.test.js, straight from main.css.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { JSDOM } from 'jsdom'

import uz from '../src/i18n/locales/uz.json' with { type: 'json' }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let vite
let axe
let dom

before(async () => {
  const { createServer } = await import('vite')
  vite = await createServer({
    root,
    // No dev server socket, no HMR: this is only here to compile modules.
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
    // Nothing here runs in a browser, so the dependency pre-bundle is
    // wasted work — and worse, its scanner crawls index.html and every
    // component reachable from it, which made this test fail on a file it
    // never renders.
    optimizeDeps: { noDiscovery: true, include: [] },
  })

  // A `url` is not decoration: without an origin jsdom refuses to hand out
  // localStorage at all, and the i18n module reads it on import.
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  global.window = dom.window
  global.document = dom.window.document
  global.Node = dom.window.Node
  global.Element = dom.window.Element
  global.HTMLElement = dom.window.HTMLElement
  global.getComputedStyle = dom.window.getComputedStyle
  // The i18n module picks the locale off localStorage the moment it is
  // imported, and half these components reach it through apiErrorText.
  global.localStorage = dom.window.localStorage
  // axe reads window/document at import time, so it is loaded after jsdom.
  axe = (await import('axe-core')).default
})

after(async () => {
  await vite?.close()
  dom?.window.close()
})

async function renderComponent(modulePath, props = {}, slots = {}) {
  const module = await vite.ssrLoadModule(modulePath)
  const i18n = createI18n({ legacy: false, locale: 'uz', messages: { uz }, missingWarn: false, fallbackWarn: false })
  const app = createSSRApp({ render: () => h(module.default, props, slots) })
  app.use(i18n)
  app.use(createPinia())
  const context = {}
  const html = await renderToString(app, context)
  // Modal and Drawer teleport to <body>; their markup is not in the string
  // the render returns, which is exactly the trap this helper exists to
  // avoid — an "empty" audit that passes because it saw nothing.
  const teleported = Object.values(context.teleports ?? {}).join('')
  assert.ok((html + teleported).trim().length > 0, `${modulePath} rendered nothing`)
  return html + teleported
}

async function audit(modulePath, props = {}, slots = {}) {
  const html = await renderComponent(modulePath, props, slots)
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    rules: {
      'color-contrast': { enabled: false },
      // Both are page-level rules: a single component is not expected to
      // carry a <main>, and a fragment has no page to be the only <h1> of.
      region: { enabled: false },
      'page-has-heading-one': { enabled: false },
      'landmark-one-main': { enabled: false },
    },
  })
  container.remove()
  return results.violations
}

function describeViolations(violations) {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.html).join('\n    ')}`)
    .join('\n  ')
}

describe('12.4 · axe-core over the shared components', () => {
  const cases = [
    ['a dialog', '/src/components/ui/Modal.vue', { modelValue: true, title: 'Sarlavha', description: 'Izoh' }],
    // A dialog with no title still has to have a name — that is what the
    // fallback `aria-label` in Modal is for.
    ['a dialog with no title', '/src/components/ui/Modal.vue', { modelValue: true }],
    ['a drawer', '/src/components/ui/Drawer.vue', { modelValue: true, title: 'Panel' }],
    ['a labelled field', '/src/components/ui/AppInput.vue', { label: 'Ism', modelValue: '' }],
    // The placeholder-only field: 43 of these exist, and the accessible
    // name has to come from somewhere.
    ['a placeholder-only field', '/src/components/ui/AppInput.vue', { placeholder: 'Qidirish', modelValue: '' }],
    ['a field in error', '/src/components/ui/AppInput.vue', { label: 'Email', modelValue: 'x', error: 'Xato' }],
    ['a password field', '/src/components/ui/AppInput.vue', { label: 'Parol', type: 'password', modelValue: '' }],
    ['a select', '/src/components/ui/AppSelect.vue', { placeholder: 'Barcha rollar', options: [{ value: '1', label: 'Admin' }] }],
    ['an image field', '/src/components/ui/ImageUploadField.vue', { label: 'Muqova', modelValue: 'https://example.test/a.webp' }],
    ['a button', '/src/components/ui/AppButton.vue', {}, { default: () => 'Saqlash' }],
    // Everything below was found broken by this test and fixed with it:
    // pagination arrows with no name, a file input nested inside the
    // dropzone button, a date picker whose calendar toggle was an unnamed
    // control.
    ['pagination', '/src/components/ui/Pagination.vue', { page: 2, totalPages: 5 }],
    ['a dropzone', '/src/components/ui/FileDropzone.vue', { title: 'Fayl tanlang' }],
    ['a date picker', '/src/components/ui/AppDatePicker.vue', { label: 'Sana', modelValue: '' }],
    ['a date picker with a value', '/src/components/ui/AppDatePicker.vue', { label: 'Sana', modelValue: '2026-09-10' }],
    ['a generated password', '/src/components/ui/GeneratedPasswordField.vue', { label: 'Parol', modelValue: 'abc123' }],
    ['a data table', '/src/components/ui/DataTable.vue', { columns: [{ key: 'a', label: 'A' }], rows: [{ a: '1' }] }],
    ['tabs', '/src/components/ui/Tabs.vue', { modelValue: 'a', tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }],
    ['an empty state', '/src/components/ui/EmptyState.vue', { title: 'Hech narsa yo\'q' }],
    ['a toast host', '/src/components/ui/ToastHost.vue', {}],
  ]

  for (const [name, modulePath, props, slots] of cases) {
    test(name, async () => {
      const violations = await audit(modulePath, props, slots)
      assert.equal(violations.length, 0, `${name}:\n  ${describeViolations(violations)}`)
    })
  }
})
