import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { aiGenerationService } from '../services/ai/aiGeneration.service.js'
import { aiBudgetService } from '../services/ai/aiBudget.service.js'
import { extractSourceText } from '../services/ai/sourceExtract.service.js'
import { ApiError } from '../utils/ApiError.js'

/** The extension, from the uploaded name — the parser is chosen by it. */
function extensionOf(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(String(filename ?? ''))
  return match ? match[1].toLowerCase() : ''
}

export const aiGenerationController = {
  /**
   * Start a course outline from a topic, or from an uploaded document.
   *
   * The extraction happens here rather than in the worker so the author
   * finds out immediately that their PDF is a scan — a job that fails
   * thirty seconds later for a reason knowable in fifty milliseconds is a
   * worse experience for no gain.
   */
  outline: asyncHandler(async (req, res) => {
    const { topic, lessonCount, lang } = req.body
    let sourceText = ''
    let sourceName = ''
    let truncatedSource = false

    if (req.file) {
      const extracted = await extractSourceText(req.file.buffer, {
        ext: extensionOf(req.file.originalname),
        filename: req.file.originalname,
      })
      sourceText = extracted.text
      sourceName = String(req.file.originalname ?? '').slice(0, 200)
      truncatedSource = extracted.truncated
    }

    if (!sourceText && !topic) {
      throw ApiError.badRequest('Give a topic or upload a document', 'AI_NO_INPUT')
    }

    const job = await aiGenerationService.create(req.user, {
      type: 'COURSE_OUTLINE',
      params: { sourceText, topic, lessonCount, lang, truncatedSource },
      sourceName,
      sourceChars: sourceText.length,
    })
    sendSuccess(res, job, 'Generation started', 202)
  }),

  /**
   * Questions from a module's own lessons, or from a topic/document.
   *
   * A topic is the normal input: a question generated from the lesson the
   * learner just read is checkable against it (see aiQuiz.service.js).
   */
  quiz: asyncHandler(async (req, res) => {
    const { topicId, topic, count, lang, types, bankId } = req.body
    let sourceText = ''
    let sourceName = ''

    if (req.file) {
      const extracted = await extractSourceText(req.file.buffer, {
        ext: extensionOf(req.file.originalname),
        filename: req.file.originalname,
      })
      sourceText = extracted.text
      sourceName = String(req.file.originalname ?? '').slice(0, 200)
    }

    if (!sourceText && !topicId && !topic) {
      throw ApiError.badRequest('Give a module, a topic or a document', 'AI_NO_INPUT')
    }

    const job = await aiGenerationService.create(req.user, {
      type: 'QUIZ',
      params: { sourceText, topicId, topic, count, lang, types, bankId },
      topicId: topicId ?? null,
      sourceName,
      sourceChars: sourceText.length,
    })
    sendSuccess(res, job, 'Generation started', 202)
  }),

  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await aiGenerationService.listMine(req.user))
  }),

  get: asyncHandler(async (req, res) => {
    sendSuccess(res, await aiGenerationService.get(req.user, req.params.id))
  }),

  usage: asyncHandler(async (req, res) => {
    sendSuccess(res, await aiBudgetService.usageThisMonth())
  }),
}
