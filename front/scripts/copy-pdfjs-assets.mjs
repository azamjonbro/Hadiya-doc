/**
 * Copies pdf.js's font and character-map data out of node_modules into
 * public/pdfjs, where the viewer points `standardFontDataUrl` and `cMapUrl`.
 *
 * Without them pdf.js has nowhere to fetch a standard-14 font or a CJK
 * character map from, and this app is served by an SPA nginx that answers any
 * unknown path with index.html — so a missing font would arrive as a 200 of
 * HTML rather than a clean 404, which is a slower and more confusing failure
 * than not asking at all.
 *
 * Copied rather than committed: 2.4 MB of binary assets belong to the package
 * that ships them. Runs from postinstall, next to the mediapipe fetch.
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const front = resolve(here, '..')
const root = resolve(front, '..')
const target = resolve(front, 'public/pdfjs')

// npm workspaces hoist to the repo root, but a standalone install keeps it local.
const candidates = [resolve(root, 'node_modules/pdfjs-dist'), resolve(front, 'node_modules/pdfjs-dist')]
const source = candidates.find((path) => existsSync(path))

if (!source) {
  console.warn('[pdfjs-assets] pdfjs-dist not installed yet — skipping')
  process.exit(0)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
for (const folder of ['standard_fonts', 'cmaps']) {
  await cp(resolve(source, folder), resolve(target, folder), { recursive: true })
}
console.log('[pdfjs-assets] standard_fonts and cmaps copied to public/pdfjs')
