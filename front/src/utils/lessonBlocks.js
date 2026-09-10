/**
 * The editor's block logic, kept out of the component so it can be tested.
 *
 * LessonEditor.vue is a form; these are the rules it follows. They exist
 * separately because every one of them is a rule with a reason — which
 * fields a type has, when a block is finished enough to save, how a saved id
 * finds its way back — and a rule inside a template is a rule nobody checks.
 *
 * The server is still the authority: it validates every block against a
 * discriminated union and sanitises the HTML ones. Nothing here is a
 * security boundary; it is what keeps the editor from sending obvious
 * nonsense and getting a 400 in the middle of somebody's paragraph.
 */

/** The twelve types, in the order the add-menu offers them. */
export const BLOCK_TYPES = [
  { type: 'HEADING', icon: 'bold' },
  { type: 'TEXT', icon: 'file-text' },
  { type: 'QUOTE', icon: 'quote' },
  { type: 'CALLOUT', icon: 'info' },
  { type: 'CODE', icon: 'code' },
  { type: 'IMAGE', icon: 'image' },
  { type: 'GALLERY', icon: 'grid' },
  { type: 'EMBED', icon: 'globe' },
  { type: 'VIDEO', icon: 'play' },
  { type: 'FILE', icon: 'paperclip' },
  { type: 'TABLE', icon: 'list' },
  { type: 'DIVIDER', icon: 'minimize' },
]

export const CALLOUT_VARIANTS = ['INFO', 'WARNING', 'SUCCESS', 'DANGER']

/**
 * A blank block of one type.
 *
 * `_key` is a local identity for `v-for` and drag-drop: a block has no id
 * until it has been saved once, and keying on the array index makes a
 * reorder rebuild every row — which loses the caret of whoever is typing.
 */
export function emptyBlock(type, { key, videoId = '', materialId = '' } = {}) {
  const base = { _key: key, type }
  switch (type) {
    case 'HEADING':
      return { ...base, text: '', level: 2 }
    case 'TEXT':
      return { ...base, text: '' }
    case 'QUOTE':
      return { ...base, text: '', author: '' }
    case 'CALLOUT':
      return { ...base, text: '', variant: 'INFO' }
    case 'CODE':
      return { ...base, text: '', language: '' }
    case 'IMAGE':
      return { ...base, url: '', alt: '', caption: '' }
    case 'GALLERY':
      return { ...base, items: [{ url: '', alt: '', caption: '' }] }
    case 'EMBED':
      return { ...base, url: '', caption: '' }
    case 'VIDEO':
      return { ...base, videoId, caption: '' }
    case 'FILE':
      return { ...base, materialId, caption: '' }
    case 'TABLE':
      return {
        ...base,
        rows: [
          ['', ''],
          ['', ''],
        ],
        hasHeader: true,
        caption: '',
      }
    default:
      return base
  }
}

/**
 * One block in the shape the API takes.
 *
 * Only the fields that type actually has. The local object carries a few
 * spares so switching a callout's variant does not have to create them, and
 * sending an `author` with an IMAGE would be refused — the server's schema is
 * a discriminated union, on purpose.
 */
export function serializeBlock(block) {
  const id = block.id ? { id: block.id } : {}
  const caption = block.caption ?? ''
  switch (block.type) {
    case 'HEADING':
      return { ...id, type: 'HEADING', text: block.text, level: Number(block.level) || 2 }
    case 'TEXT':
      return { ...id, type: 'TEXT', text: block.text }
    case 'QUOTE':
      return { ...id, type: 'QUOTE', text: block.text, author: block.author ?? '' }
    case 'CALLOUT':
      return { ...id, type: 'CALLOUT', text: block.text, variant: block.variant ?? 'INFO' }
    case 'CODE':
      return { ...id, type: 'CODE', text: block.text, language: block.language ?? '' }
    case 'IMAGE':
      return { ...id, type: 'IMAGE', url: block.url, alt: block.alt ?? '', caption }
    case 'GALLERY':
      // An image the author added but never uploaded into is dropped rather
      // than sent as an empty url, which the validator would refuse.
      return {
        ...id,
        type: 'GALLERY',
        items: (block.items ?? [])
          .filter((item) => item.url)
          .map((item) => ({ url: item.url, alt: item.alt ?? '', caption: item.caption ?? '' })),
      }
    case 'EMBED':
      return { ...id, type: 'EMBED', url: block.url, caption }
    case 'VIDEO':
      return { ...id, type: 'VIDEO', videoId: block.videoId, caption }
    case 'FILE':
      return { ...id, type: 'FILE', materialId: block.materialId, caption }
    case 'TABLE':
      return {
        ...id,
        type: 'TABLE',
        rows: (block.rows ?? []).map((row) => [...row]),
        hasHeader: block.hasHeader !== false,
        caption,
      }
    default:
      return { ...id, type: 'DIVIDER' }
  }
}

/** Strips the markup so "is there any text in here" has an answer. */
function hasText(value) {
  return Boolean(
    String(value ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
  )
}

/**
 * Whether a block is finished enough to send.
 *
 * The server refuses an empty TEXT or a urlless IMAGE — correctly, since a
 * stored empty block is content nobody can read. But an author adds a block
 * *before* filling it in, and a 400 on every autosave in between would make
 * the editor look broken. So a half-written block is simply not part of the
 * save, and the header says how many are waiting.
 */
export function isComplete(block) {
  switch (block.type) {
    case 'HEADING':
    case 'TEXT':
    case 'QUOTE':
    case 'CALLOUT':
      // A rich-text field left untouched holds an empty tag rather than an
      // empty string, so this asks whether there is text, not whether the
      // string is non-empty.
      return hasText(block.text)
    case 'CODE':
      // Whitespace can be the point in a code sample, so this one only
      // needs to be non-empty.
      return Boolean(String(block.text ?? '').length)
    case 'IMAGE':
    case 'EMBED':
      return Boolean(block.url)
    case 'GALLERY':
      return (block.items ?? []).some((item) => item.url)
    case 'VIDEO':
      return Boolean(block.videoId)
    case 'FILE':
      return Boolean(block.materialId)
    case 'TABLE':
      return (block.rows ?? []).some((row) => row.some((cell) => String(cell).trim()))
    default:
      return true
  }
}

/**
 * Copies the ids the server assigned onto the local blocks.
 *
 * Position by position against what was actually *sent*, which is why the
 * caller keeps that array: the local list may contain half-written blocks
 * that were left out, so the response's third block is not necessarily the
 * local third. Nothing else from the response is adopted — replacing the
 * array would drop the caret of whoever is typing.
 *
 * Ids matter because reading progress is recorded against them: a save that
 * hands every block a new id resets everybody's place in the lesson.
 */
export function adoptIds(sent, returned) {
  sent.forEach((block, index) => {
    const id = returned?.[index]?.id
    if (id && block.id !== id) block.id = id
  })
  return sent
}
