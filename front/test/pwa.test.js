// 12.1 — what the service worker precaches.
//
// The config that decides this is declarative, so the thing worth pinning
// is the *outcome*: an install must stay small, and the four heavy document
// viewers must stay out of it. Both are silent failures otherwise — rename
// a chunk and the exclusion stops matching, and nobody notices until an
// install is a 7 MB download on a metered phone.
//
// Reads the built worker rather than the config, because the config being
// right and the output being right are different claims.

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const swPath = path.join(root, 'dist', 'sw.js')

// The budget an install has to fit in. 3 MB is roughly a slow minute on a
// mobile connection; past that the app should be asking before it downloads.
const PRECACHE_BUDGET_BYTES = 3 * 1024 * 1024

let manifest = null

describe('12.1 · the precache manifest', () => {
  before(() => {
    if (!fs.existsSync(swPath)) return
    const source = fs.readFileSync(swPath, 'utf8')
    // vite-plugin-pwa injects the manifest as an array literal of
    // `{revision, url}` objects — minified, so the keys are quoted. Parsed
    // by extracting the urls rather than by evaluating the worker, which
    // would need a service-worker global.
    manifest = [...source.matchAll(/"url":"([^"]+)"/g)].map((match) => match[1])
  })

  test('the shell is precached', (t) => {
    if (!manifest) return t.skip('no build in front/dist — run `npm run build` first')
    assert.ok(manifest.includes('index.html'), 'index.html is not precached, so the app cannot open offline')
    assert.ok(
      manifest.some((url) => /^assets\/index-[A-Za-z0-9_-]+\.js$/.test(url)),
      'the entry bundle is not precached'
    )
    assert.ok(
      manifest.some((url) => url.endsWith('.css')),
      'no stylesheet is precached, so an offline app would render unstyled'
    )
  })

  test('the heavy document viewers are not precached', (t) => {
    if (!manifest) return t.skip('no build in front/dist')
    // About 4 MB between them, each behind one screen. They are cached on
    // first use by a runtime rule in src/sw.js instead.
    const heavy = manifest.filter((url) =>
      /(pdf\.worker\.min|pptx-preview|exceljs\.min|mammoth\.browser|^assets\/pdf-)/.test(url)
    )
    assert.deepEqual(heavy, [])
  })

  test('the vendor folders in public/ are not precached', (t) => {
    if (!manifest) return t.skip('no build in front/dist')
    // Tens of megabytes of face models and a PDF renderer.
    assert.deepEqual(manifest.filter((url) => /^(mediapipe|pdfjs)\//.test(url)), [])
  })

  test('the install stays inside its budget', (t) => {
    if (!manifest) return t.skip('no build in front/dist')
    const total = manifest.reduce((sum, url) => {
      const file = path.join(root, 'dist', url)
      return sum + (fs.existsSync(file) ? fs.statSync(file).size : 0)
    }, 0)
    assert.ok(
      total <= PRECACHE_BUDGET_BYTES,
      `precache is ${(total / 1024 / 1024).toFixed(2)} MB, over the ${PRECACHE_BUDGET_BYTES / 1024 / 1024} MB budget`
    )
  })

  test('the worker itself keeps the two rules that make it safe', (t) => {
    if (!fs.existsSync(swPath)) return t.skip('no build in front/dist')
    const source = fs.readFileSync(swPath, 'utf8')
    // A navigation fallback without a denylist answers `/api/...` with
    // index.html: a request that should fail loudly returns HTML with a 200.
    assert.match(source, /denylist/)
    assert.match(source, /\\\/api\\\//)
    // And the update handshake, which is what keeps a new version from
    // reloading somebody out of a timed assessment.
    assert.match(source, /SKIP_WAITING/)
  })
})
