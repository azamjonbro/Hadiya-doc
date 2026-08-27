import JSZip from 'jszip'

// Nine levels of nothing in particular. The renderer only needs the element
// to exist — every run in a real deck carries its own size and colour, and
// what little this does supply matches PowerPoint's own default body text.
const DEFAULT_TEXT_STYLE =
  '<p:defaultTextStyle>' +
  Array.from({ length: 9 }, (_, i) => `<a:lvl${i + 1}pPr><a:defRPr sz="1800"/></a:lvl${i + 1}pPr>`).join('') +
  '</p:defaultTextStyle>'

const OVERRIDE_TAG = /<Override\b[^>]*?PartName="([^"]+)"[^>]*?(?:\/>|>\s*<\/Override>)/g

/**
 * pptx-preview gives up on a slightly malformed package, and it gives up
 * silently: a single try/catch wraps its whole part-loading pass, so one bad
 * lookup leaves `slides` empty and the viewer paints its black wrapper with
 * nothing inside it. Two defects, both of which PowerPoint itself shrugs off,
 * are enough to trigger that — and decks exported by online slide generators
 * carry them routinely:
 *
 *   1. [Content_Types].xml declares parts the archive does not contain (one
 *      deck declared slideMaster2..10 while shipping only slideMaster1.xml).
 *      The loader calls files[partName].async() on every declared part, so
 *      the first dangling one throws and neither layouts nor slides are ever
 *      read.
 *   2. presentation.xml carries no <p:defaultTextStyle>. It is optional in
 *      ECMA-376; the renderer calls Object.keys() on it unguarded.
 *
 * Both are repaired here, in the browser, before the bytes reach the library.
 * A well-formed deck is returned as it came in — the check costs two small
 * XML reads and no re-zip.
 */
export async function repairPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const contentTypesFile = zip.file('[Content_Types].xml')
  const presentationFile = zip.file('ppt/presentation.xml')
  // Not the shape we know how to repair. Hand it over untouched and let the
  // library be the one to decide it cannot read it.
  if (!contentTypesFile || !presentationFile) return buffer

  const contentTypes = await contentTypesFile.async('string')
  const presentation = await presentationFile.async('string')

  const parts = new Set(Object.keys(zip.files))
  const repairedTypes = contentTypes.replace(OVERRIDE_TAG, (tag, partName) =>
    parts.has(partName.replace(/^\//, '')) ? tag : ''
  )

  const repairedPresentation = presentation.includes('<p:defaultTextStyle')
    ? presentation
    : presentation.replace('</p:presentation>', `${DEFAULT_TEXT_STYLE}</p:presentation>`)

  if (repairedTypes === contentTypes && repairedPresentation === presentation) return buffer

  zip.file('[Content_Types].xml', repairedTypes)
  zip.file('ppt/presentation.xml', repairedPresentation)
  // STORE rather than DEFLATE: these bytes travel as far as the parser on the
  // next line and no further, and re-deflating 20 MB of already-compressed
  // PNGs would cost seconds to save nothing.
  return zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' })
}
