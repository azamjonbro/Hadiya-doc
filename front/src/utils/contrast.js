// WCAG 2.1 contrast maths, and a reader for the design tokens in
// src/assets/main.css.
//
// This lives in src/utils rather than inside the test because the ratio is
// the thing worth being able to check anywhere — the palette in main.css was
// never measured before 12.4, and three pairs turned out to be under AA.

// sRGB -> relative luminance (WCAG 2.x definition).
export function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

// 1 (identical) … 21 (black on white).
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// AA thresholds. Large text is >=24px, or >=18.66px bold.
export const AA_TEXT = 4.5
export const AA_LARGE_TEXT = 3
export const AA_NON_TEXT = 3 // 1.4.11 — control boundaries, focus rings

// The tokens are declared as bare `R G B` triples (so Tailwind can add an
// alpha), which is also why they can be read without a CSS parser.
export function parseColorTokens(css) {
  const themes = { light: {}, dark: {} }
  const darkAt = css.indexOf(':root.dark')
  const blocks = {
    light: css.slice(css.indexOf(':root {'), darkAt === -1 ? undefined : darkAt),
    dark: darkAt === -1 ? '' : css.slice(darkAt, css.indexOf('}', darkAt)),
  }
  for (const [theme, block] of Object.entries(blocks)) {
    for (const match of block.matchAll(/--(color-[\w-]+):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g)) {
      themes[theme][match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])]
    }
  }
  return themes
}
