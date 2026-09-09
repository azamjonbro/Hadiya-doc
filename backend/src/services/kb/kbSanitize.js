import sanitizeHtml from 'sanitize-html'

/**
 * What a knowledge-base article is allowed to contain.
 *
 * An allowlist, not a blocklist. A blocklist is a list of the attacks
 * somebody thought of; everything else — a new attribute, an SVG handler, a
 * data: URL — passes. The allowlist inverts that: anything not named here
 * is dropped, so an unknown trick is refused by default.
 *
 * This matters more here than anywhere else in the platform. Articles are
 * rich HTML written by staff and rendered back with `v-html`, so whatever
 * the server stores, every reader's browser executes. News deliberately
 * avoids the problem by being plain text (news.model.js); a procedure with
 * headings and tables cannot.
 */

const ALLOWED_TAGS = [
  'h2', 'h3', 'h4',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img',
  'span', 'div',
]

export const KB_SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    // A class is allowed for the editor's own formatting; `style` is not —
    // it is the usual way to hide an element over the whole page or paint a
    // fake dialog over the interface.
    '*': ['class'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  // http(s) and mailto only. `javascript:` is the obvious one; `data:` is
  // the one people forget, and it can carry a whole HTML document.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // Anything not on the list is removed with its content kept, except for
  // these, where the content is the payload.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  transformTags: {
    // Every outbound link opens in a new tab and cannot reach back through
    // `window.opener` — the article author does not choose that.
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
  },
}

export function sanitizeArticleBody(html) {
  return sanitizeHtml(String(html ?? ''), KB_SANITIZE_OPTIONS)
}

/**
 * The same content as plain text, for the search index.
 *
 * Indexing the HTML would match `<strong>` as a word and would miss a term
 * split across a tag boundary — "mehnat <b>muhofazasi</b>" is one phrase to
 * a reader and two fragments to a tokeniser.
 */
export function toPlainText(html) {
  return sanitizeHtml(String(html ?? ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
