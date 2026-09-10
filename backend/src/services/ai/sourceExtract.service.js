import JSZip from 'jszip'
import mammoth from 'mammoth'
import { XMLParser } from 'fast-xml-parser'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

/**
 * Turning an uploaded document into text, on the server (10.2).
 *
 * On the server and not in the browser, for two reasons. The obvious one is
 * that the model call happens here, so the text has to arrive here anyway;
 * shipping a parser to the client would mean sending the extracted text
 * back over the wire and trusting it. The other is that the platform
 * already parses these formats in the browser for *viewing*
 * (MaterialViewer), and the two jobs want different things — a viewer wants
 * layout, a prompt wants prose in reading order.
 *
 * Three formats, three libraries, one contract: `{ text, blocks, truncated }`.
 */

// The ceiling is about the prompt, not the file. Roughly 100k tokens of
// source leaves room for instructions and a long structured answer inside a
// 1M-token context, and a course outline built from more than that is not
// an outline — it is a summary of a summary.
const MAX_CHARS = 400_000

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true })

/** Collapses the whitespace a converter leaves behind, without eating paragraphs. */
function tidy(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function capped(text) {
  const tidied = tidy(text)
  if (tidied.length <= MAX_CHARS) return { text: tidied, truncated: false }
  // Cut at a paragraph boundary rather than mid-sentence: the model reads
  // the tail as the end of the document either way, and half a sentence
  // there produces a confident answer about nothing.
  const cut = tidied.slice(0, MAX_CHARS)
  const lastBreak = cut.lastIndexOf('\n\n')
  return { text: lastBreak > MAX_CHARS * 0.8 ? cut.slice(0, lastBreak) : cut, truncated: true }
}

/**
 * PDF text, page by page.
 *
 * pdfjs rather than a smaller parser because it is the same engine the
 * viewer already uses, so a PDF that displays in the app is a PDF this can
 * read. The legacy build is the one that runs under Node.
 */
async function fromPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // No worker: this is already running in a worker process, and spawning
    // one per document is how a batch of uploads exhausts the box.
    disableWorker: true,
    // A scanned page has no text layer; asking for the fonts would download
    // standard font data we never render.
    disableFontFace: true,
    isEvalSupported: false,
  }).promise

  const pages = []
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number)
    const content = await page.getTextContent()
    // `str` items in reading order; `hasEOL` is where pdfjs saw a line end.
    const text = content.items.map((item) => (item.hasEOL ? `${item.str}\n` : item.str)).join(' ')
    pages.push(tidy(text))
    page.cleanup()
  }
  await document.destroy()

  return { text: pages.join('\n\n'), blocks: pages.length, blockLabel: 'page' }
}

/** DOCX via mammoth — the converter the app already uses for viewing. */
async function fromDocx(buffer) {
  const { value, messages } = await mammoth.extractRawText({ buffer })
  if (messages?.length) {
    logger.info('mammoth reported messages while extracting text', { count: messages.length })
  }
  const paragraphs = tidy(value).split('\n').filter(Boolean)
  return { text: paragraphs.join('\n'), blocks: paragraphs.length, blockLabel: 'paragraph' }
}

/**
 * PPTX by reading the slide XML directly.
 *
 * No library: a pptx is a zip of `ppt/slides/slideN.xml`, and the text is
 * every `<a:t>` run inside. jszip and the XML parser are already
 * dependencies (SCORM needs both), and a slide deck's reading order is
 * exactly its slide order — which is more than a generic converter would
 * preserve.
 */
async function fromPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    // slide10 must not sort before slide2.
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]))

  const slides = []
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string')
    const runs = []
    const walk = (node) => {
      if (node === null || node === undefined) return
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      if (typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        // `t` is the text run; everything else is shape and style.
        if (key === 't') {
          if (Array.isArray(value)) value.forEach((item) => runs.push(String(item)))
          else runs.push(String(value))
        } else {
          walk(value)
        }
      }
    }
    walk(parser.parse(xml))
    const slideText = tidy(runs.join('\n'))
    if (slideText) slides.push(`## ${slides.length + 1}\n${slideText}`)
  }

  return { text: slides.join('\n\n'), blocks: slides.length, blockLabel: 'slide' }
}

const BY_EXTENSION = {
  pdf: fromPdf,
  docx: fromDocx,
  pptx: fromPptx,
}

export const SUPPORTED_SOURCE_EXTENSIONS = Object.keys(BY_EXTENSION)

/**
 * @param {Buffer} buffer
 * @param {{ext: string, filename?: string}} options
 * @returns {Promise<{text: string, blocks: number, blockLabel: string, truncated: boolean, chars: number}>}
 * @throws 400 when the format is unsupported, or when the file yields no
 *   text at all — which for a PDF almost always means a scan. "This looks
 *   like a scanned document" is the answer an author can act on; an empty
 *   course outline generated from nothing is not.
 */
export async function extractSourceText(buffer, { ext, filename = '' } = {}) {
  const extractor = BY_EXTENSION[String(ext ?? '').toLowerCase()]
  if (!extractor) {
    throw ApiError.badRequest(
      `Only ${SUPPORTED_SOURCE_EXTENSIONS.join(', ')} files can be read`,
      'UNSUPPORTED_SOURCE_TYPE'
    )
  }

  let extracted
  try {
    extracted = await extractor(buffer)
  } catch (error) {
    logger.warn('Source extraction failed', { filename, ext, error: error.message })
    throw ApiError.badRequest('The file could not be read', 'SOURCE_UNREADABLE')
  }

  const { text, truncated } = capped(extracted.text)
  if (!text) {
    throw ApiError.badRequest(
      'No text could be read from this file — a scanned document needs OCR first',
      'SOURCE_HAS_NO_TEXT'
    )
  }

  return {
    text,
    blocks: extracted.blocks,
    blockLabel: extracted.blockLabel,
    truncated,
    chars: text.length,
  }
}
