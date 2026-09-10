import sanitizeHtml from 'sanitize-html'
import mongoose from 'mongoose'
import { KB_SANITIZE_OPTIONS } from '../kb/kbSanitize.js'

/**
 * What a lesson's blocks are allowed to be, and how far through one a reader
 * has got. Both live here because both answer to the same list of blocks.
 *
 * The sanitiser is the knowledge base's allowlist, imported rather than
 * copied. A TEXT block and a KB article are the same hazard: rich HTML,
 * written by staff, stored, and rendered back with `v-html` — so whatever
 * the server accepts, every reader's browser executes. Two allowlists would
 * mean the day somebody tightens one of them, the other keeps accepting
 * what was just judged unsafe.
 */

const HEADING_LEVELS = [2, 3, 4]

/** Text with every tag removed — a heading is a line, not a document. */
function plainText(value) {
  return sanitizeHtml(String(value ?? ''), { allowedTags: [], allowedAttributes: {} }).trim()
}

/**
 * An id the client sent back, if it is one of ours.
 *
 * Editing a lesson replaces the whole `blocks` array, so a block keeps its
 * identity only if the id survives the round trip — and reading progress is
 * recorded against those ids. A blank or malformed id is a new block, not an
 * error: that is exactly what the editor sends for one the author just added.
 */
function keepId(block) {
  const id = block.id ?? block._id
  return id && mongoose.isValidObjectId(String(id)) ? { _id: String(id) } : {}
}

/**
 * The stored form of one block.
 *
 * Every type is rebuilt field by field rather than spread from the request:
 * a spread stores whatever else the caller sent, and the next reader of the
 * collection cannot tell which fields the platform actually honours.
 */
function toStoredBlock(block) {
  const base = keepId(block)
  switch (block.type) {
    case 'HEADING':
      return {
        ...base,
        type: 'HEADING',
        text: plainText(block.text),
        level: HEADING_LEVELS.includes(Number(block.level)) ? Number(block.level) : 2,
      }
    case 'TEXT':
      return { ...base, type: 'TEXT', text: sanitizeHtml(String(block.text ?? ''), KB_SANITIZE_OPTIONS) }
    case 'IMAGE':
      return {
        ...base,
        type: 'IMAGE',
        url: String(block.url ?? ''),
        // Alt text is not optional in practice — a lesson made of
        // unlabelled images is unreadable to a screen reader, and 12.x is
        // where that becomes a requirement. Stored as given, empty
        // included, so the editor can say what is missing.
        alt: plainText(block.alt),
        caption: plainText(block.caption),
      }
    case 'DIVIDER':
      return { ...base, type: 'DIVIDER' }
    default:
      // Unreachable through the API — the validator rejects unknown types
      // before this runs. Kept so a migration or a script cannot quietly
      // write a block the readers will not understand.
      throw new Error(`Unknown lesson block type: ${block.type}`)
  }
}

export function toStoredBlocks(blocks) {
  return (blocks ?? []).map(toStoredBlock)
}

/** The blocks as the API reports them: `id`, like every other entity. */
export function toPublicBlocks(blocks) {
  return (blocks ?? []).map((block) => {
    const plain = typeof block.toObject === 'function' ? block.toObject() : block
    const { _id, ...rest } = plain
    return { id: String(_id), ...rest }
  })
}

/**
 * A lesson with nothing in it cannot be finished, so it must not be
 * publishable: it would sit in a curriculum as an item no learner can ever
 * complete, and the completion rule counts published items (3.1). An empty
 * draft is fine — that is every lesson a second after it is created.
 */
export function isPublishable(blocks) {
  return (blocks ?? []).length > 0
}

/**
 * How far through this lesson this person is.
 *
 * Computed, never stored (see lessonProgress.model.js). Blocks the author
 * has since deleted are dropped from the count rather than credited: they
 * are not part of the lesson any more, and counting them could hold a
 * reader above 100%.
 */
export function lessonCompletion(lesson, row) {
  const blockIds = new Set((lesson.blocks ?? []).map((block) => String(block._id)))
  const totalBlocks = blockIds.size
  const viewedBlocks = (row?.viewedBlocks ?? []).filter((id) => blockIds.has(String(id))).length

  // Finished stays finished. Re-opening a completed lesson after the author
  // added a paragraph would otherwise recompute the percentage back down,
  // and a course that was complete yesterday would un-complete itself.
  if (row?.completedAt) {
    return { totalBlocks, viewedBlocks, completionPercent: 100, completed: true }
  }

  const completionPercent = totalBlocks ? Math.min(100, Math.round((viewedBlocks / totalBlocks) * 100)) : 0
  return { totalBlocks, viewedBlocks, completionPercent, completed: totalBlocks > 0 && viewedBlocks >= totalBlocks }
}
