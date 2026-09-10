// 12.4 — the colour palette, measured.
//
// The audit that started BLOK 12 said the theme had "never been measured",
// and it was right: faint text was 2.6:1 on the page background, white on
// the brand blue was 3.98:1, and the amber warning colour 3.19:1 — all
// under WCAG AA. The values in main.css were then chosen against these
// assertions, so this file is the reason they are what they are, and the
// thing that stops the next palette tweak from quietly undoing it.
//
// It reads main.css rather than a JS copy of the palette: a duplicate table
// would pass while the stylesheet regressed.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrastRatio, parseColorTokens, AA_TEXT, AA_NON_TEXT } from '../src/utils/contrast.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'src', 'assets', 'main.css'), 'utf8')
const themes = parseColorTokens(css)

// Every surface a piece of text can land on. A pair has to pass on the
// *worst* of them, which is why the list is explicit: text-faint passed on
// white and failed on the page background, and only one of those is where
// captions actually sit.
const SURFACES = ['color-bg', 'color-surface', 'color-surface-2', 'color-surface-hover']

// [foreground, backgrounds, minimum, what it is]
const TEXT_PAIRS = [
  ['color-text', SURFACES, AA_TEXT, 'body text'],
  ['color-text-muted', SURFACES, AA_TEXT, 'secondary text'],
  ['color-text-faint', SURFACES, AA_TEXT, 'captions and hints — real text, not decoration'],
  ['color-primary', ['color-bg', 'color-surface', 'color-primary-subtle'], AA_TEXT, 'links and quiet primary actions'],
  ['color-success', ['color-surface', 'color-success-subtle'], AA_TEXT, 'success text and badges'],
  ['color-warning', ['color-surface', 'color-warning-subtle'], AA_TEXT, 'warning text and badges'],
  ['color-danger', ['color-surface', 'color-danger-subtle'], AA_TEXT, 'error text and badges'],
  ['color-info', ['color-surface', 'color-info-subtle'], AA_TEXT, 'info text and badges'],
  // Filled controls: the label sits on the accent colour itself.
  ['color-primary-foreground', ['color-primary', 'color-primary-hover'], AA_TEXT, 'primary button label'],
  ['color-success-foreground', ['color-success'], AA_TEXT, 'filled success badge label'],
  ['color-warning-foreground', ['color-warning'], AA_TEXT, 'filled warning badge label'],
  ['color-danger-foreground', ['color-danger'], AA_TEXT, 'filled danger button label'],
  ['color-info-foreground', ['color-info'], AA_TEXT, 'filled info badge label'],
]

// 1.4.11: a boundary or indicator a sighted user needs in order to find the
// control. Card dividers are deliberately absent — `--color-border` is
// decorative, and darkening it to 3:1 would put a hard grey grid over every
// page for no accessibility gain.
const NON_TEXT_PAIRS = [
  ['color-border-strong', SURFACES, AA_NON_TEXT, 'input / select / dropzone boundary'],
  // The ring is drawn with `outline-offset`, i.e. *outside* the control, so
  // the colour it has to beat is the page behind the control — not the
  // control's own fill. That is what makes one ring colour work on a
  // primary button and on a plain link alike.
  ['color-focus', ['color-bg', 'color-surface', 'color-surface-2'], AA_NON_TEXT, 'keyboard focus ring, offset onto the page behind the control'],
]

for (const theme of ['light', 'dark']) {
  describe(`12.4 · ${theme} theme meets WCAG AA`, () => {
    const tokens = themes[theme]

    test('the palette parsed', () => {
      assert.ok(Object.keys(tokens).length > 20, `only ${Object.keys(tokens).length} tokens found`)
    })

    for (const [fg, backgrounds, min, what] of [...TEXT_PAIRS, ...NON_TEXT_PAIRS]) {
      for (const bg of backgrounds) {
        test(`${fg} on ${bg} (${what})`, () => {
          assert.ok(tokens[fg], `${fg} is not defined in the ${theme} theme`)
          assert.ok(tokens[bg], `${bg} is not defined in the ${theme} theme`)
          const ratio = contrastRatio(tokens[fg], tokens[bg])
          assert.ok(
            ratio >= min,
            `${fg} on ${bg} is ${ratio.toFixed(2)}:1, AA wants ${min}:1 (${what})`
          )
        })
      }
    }
  })
}

describe('12.4 · the contrast maths itself', () => {
  test('black on white is 21:1', () => {
    assert.equal(Math.round(contrastRatio([0, 0, 0], [255, 255, 255])), 21)
  })

  test('a colour against itself is 1:1', () => {
    assert.equal(contrastRatio([18, 52, 86], [18, 52, 86]).toFixed(2), '1.00')
  })

  test('the ratio does not depend on which colour is named first', () => {
    const a = contrastRatio([0, 98, 217], [255, 255, 255])
    const b = contrastRatio([255, 255, 255], [0, 98, 217])
    assert.equal(a, b)
  })

  test('both themes are read, not just the first block', () => {
    assert.notDeepEqual(themes.light['color-text'], themes.dark['color-text'])
  })
})
