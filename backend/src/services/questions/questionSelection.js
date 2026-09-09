import { createHash, randomBytes } from 'node:crypto'
import { Question } from '../../models/question.model.js'

/**
 * Builds the paper one learner sits, and freezes it.
 *
 * A test with a pool draws different questions for different people, and a
 * shuffled test shows them in a different order. That is the point — but it
 * means the paper only exists once it has been generated, so it has to be
 * *recorded*. AT-07 is the rule: reloading the page must return the same ten
 * questions in the same order, not a fresh draw. Without a stored
 * questionSet, a reload is a re-roll and a learner can shop for an easy
 * paper by pressing F5.
 *
 * The draw is seeded rather than merely random, so the same seed rebuilds
 * the same paper. That is what lets a support question a month later —
 * "why did she get these five?" — actually be answered from the session row.
 */

/**
 * A deterministic pseudo-random stream from a seed.
 *
 * Not `Math.random`, which cannot be seeded, and not a full PRNG library
 * for what is a shuffle of at most a few dozen items. SHA-256 of
 * `seed:counter` gives an unbiased 32-bit value per call and is
 * reproducible on any machine, which is the only property that matters.
 */
export function seededRandom(seed) {
  let counter = 0
  return () => {
    const digest = createHash('sha256').update(`${seed}:${counter++}`).digest()
    return digest.readUInt32BE(0) / 0x1_0000_0000
  }
}

/** Fisher–Yates, with the seeded stream. Returns a new array. */
export function shuffle(items, random) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function newSeed() {
  return randomBytes(16).toString('hex')
}

/**
 * Picks `count` questions from a pool.
 *
 * Fewer matches than asked for is not an error: a bank that has thinned out
 * because questions were retired should still produce a test. It is
 * reported so the author can see it (`shortfall`), rather than silently
 * producing a five-question test where ten were configured.
 */
export function drawFromPool(candidates, count, random) {
  const drawn = shuffle(candidates, random).slice(0, count)
  return { drawn, shortfall: Math.max(0, count - drawn.length) }
}

/**
 * The question set for one sitting: fixed questions first, then each pool's
 * draw, then an optional shuffle of the whole paper.
 *
 * Options are ordered here too, and stored per question. The answer comes
 * back as an option id, so the order is not needed to grade — it is needed
 * to redraw the paper exactly as it was sat, on the review screen.
 */
export async function buildQuestionSet(quiz, { seed = newSeed() } = {}) {
  const random = seededRandom(seed)
  const shortfalls = []

  const fixed = await Question.find({ _id: { $in: quiz.questionIds ?? [] } }).lean()
  // `find` returns documents in index order, not in the order asked for, and
  // the author's order is the one that matters.
  const fixedById = new Map(fixed.map((question) => [String(question._id), question]))
  const selected = (quiz.questionIds ?? []).map((id) => fixedById.get(String(id))).filter(Boolean)

  const alreadyChosen = new Set(selected.map((question) => String(question._id)))

  for (const pool of quiz.pools ?? []) {
    const filter = { bankId: pool.bankId }
    if (pool.tags?.length) filter.tags = { $in: pool.tags }
    if (pool.difficulty) filter.difficulty = pool.difficulty

    const candidates = (await Question.find(filter).lean()).filter(
      // A question already on the paper as a fixed one must not be drawn
      // again — the learner would see it twice and be marked on it twice.
      (question) => !alreadyChosen.has(String(question._id))
    )
    const { drawn, shortfall } = drawFromPool(candidates, pool.count, random)
    for (const question of drawn) {
      alreadyChosen.add(String(question._id))
      selected.push(question)
    }
    if (shortfall) shortfalls.push({ bankId: String(pool.bankId), asked: pool.count, short: shortfall })
  }

  const ordered = quiz.shuffleQuestions ? shuffle(selected, random) : selected

  const questionSet = ordered.map((question) => ({
    questionId: question._id,
    optionOrder: presentationOrder(question, quiz, random),
  }))

  return { seed, questionSet, questions: ordered, shortfalls }
}

/**
 * The order the answerable parts are shown in, stored so a reload redraws
 * the identical paper.
 *
 * For choice questions this is the option ids, shuffled only if the test
 * asks for it. For SEQUENCE and MATCHING it is shuffled *always*: those two
 * store their payload in the correct order, so presenting it as stored
 * hands over the answer key — the question becomes "press submit".
 */
function presentationOrder(question, quiz, random) {
  switch (question.type) {
    case 'SEQUENCE': {
      const items = (question.payload?.items ?? []).map(String)
      return items.length ? shuffle(items, random) : items
    }
    case 'MATCHING': {
      const right = (question.payload?.pairs ?? []).map((pair) => String(pair.right))
      return right.length ? shuffle(right, random) : right
    }
    default: {
      const optionIds = (question.payload?.options ?? []).map((option) => String(option.id))
      return quiz.shuffleOptions && optionIds.length ? shuffle(optionIds, random) : optionIds
    }
  }
}

/**
 * The paper as the learner must see it — answers stripped.
 *
 * Everything that says which option is right is removed here rather than in
 * the controller, because "the endpoint that forgot to strip it" is exactly
 * how a test ends up shipping its own answer key.
 */
export function toLearnerPaper(questions, questionSet) {
  const byId = new Map(questions.map((question) => [String(question._id), question]))

  return questionSet.map((entry, index) => {
    const question = byId.get(String(entry.questionId))
    if (!question) return null
    const options = question.payload?.options ?? []
    const optionById = new Map(options.map((option) => [String(option.id), option]))

    return {
      number: index + 1,
      questionId: String(question._id),
      type: question.type,
      text: question.text,
      points: question.points,
      media: question.media ?? null,
      // Ordered as this learner's session recorded it.
      options: entry.optionOrder
        .map((id) => optionById.get(String(id)))
        .filter(Boolean)
        .map((option) => ({ id: String(option.id), text: option.text })),
      payload: stripAnswers(question, entry.optionOrder ?? []),
    }
  }).filter(Boolean)
}

/** Per type: the part of the payload a learner may see. */
function stripAnswers(question, order) {
  const payload = question.payload ?? {}
  switch (question.type) {
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE':
      // Options are carried above, already ordered and without isCorrect.
      return {}
    case 'MATCHING':
      // Left column in the author's order, right column in the shuffled
      // order the session recorded — paired up as stored, it is the key.
      return { left: (payload.pairs ?? []).map((pair) => pair.left), right: order }
    case 'SEQUENCE':
      // Stored in the correct order, so it is never sent in it.
      return { items: order }
    case 'FILL_BLANK':
      return { template: payload.template ?? '', blankCount: (payload.blanks ?? []).length }
    case 'SELECT_LIST':
      return { blanks: (payload.blanks ?? []).map((blank) => ({ options: blank.options ?? [] })) }
    case 'HOTSPOT':
      return { imageKey: payload.imageKey ?? '' }
    case 'LIKERT':
      return { scale: payload.scale ?? 5, labels: payload.labels ?? [] }
    case 'DRAG_DROP':
    case 'DRAG_WORDS':
      return {
        zones: payload.zones ?? [],
        items: (payload.items ?? []).map((item) => ({ id: item.id, text: item.text })),
      }
    case 'ESSAY':
      return { minWords: payload.minWords ?? 0, maxWords: payload.maxWords ?? 0 }
    case 'TRUE_FALSE':
    case 'SHORT_ANSWER':
    case 'NUMERIC':
    default:
      return {}
  }
}
