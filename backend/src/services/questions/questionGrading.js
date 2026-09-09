/**
 * Grading, one function per question type.
 *
 * Two rules run through all of it.
 *
 * First, a malformed answer is a wrong answer, never an exception. These
 * functions are called from an attempt submission, and the payload comes
 * from a browser: a missing field, a string where an array was expected, a
 * null. Throwing there fails the whole submission and loses every other
 * answer in it, which punishes the learner for a bug. So every branch
 * defends itself and falls through to zero.
 *
 * Second, partial credit is a per-quiz decision, not a per-type one. With
 * it off, a question is right or it is not — matching seven of eight pairs
 * scores nothing. With it on, the share of the answer that is correct is
 * the share of the points awarded. Which of the two a test uses is a real
 * pedagogical choice, so neither is hard-coded here.
 *
 * Everything below is pure: a question, an answer, a flag. No database, no
 * clock, no request. That is what makes the thirteen types testable one at
 * a time (test/questionGrading.test.js) instead of only through a live
 * attempt.
 */

/** Whitespace and case folded, because nobody types an answer twice alike. */
function normalizeText(value, caseSensitive = false) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  return caseSensitive ? text : text.toLocaleLowerCase()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

/** Clamped to [0, 1] — a proportion is never negative and never over one. */
function ratio(earned, total) {
  if (!total || total <= 0) return 0
  return Math.min(1, Math.max(0, earned / total))
}

const graders = {
  SINGLE_CHOICE(payload, answer) {
    const options = asArray(payload.options)
    const chosen = answer?.optionId ?? answer
    const option = options.find((entry) => String(entry.id) === String(chosen))
    return option?.isCorrect ? 1 : 0
  },

  MULTI_CHOICE(payload, answer, { partialCredit }) {
    const options = asArray(payload.options)
    const correctIds = new Set(options.filter((option) => option.isCorrect).map((option) => String(option.id)))
    const chosen = new Set(asArray(answer?.optionIds ?? answer).map((id) => String(id)))
    if (!correctIds.size) return 0

    const hits = [...chosen].filter((id) => correctIds.has(id)).length
    const misses = [...chosen].filter((id) => !correctIds.has(id)).length

    if (!partialCredit) {
      // Exactly the correct set, nothing more and nothing less.
      return hits === correctIds.size && misses === 0 ? 1 : 0
    }
    // Wrong picks cancel right ones, so selecting everything scores zero
    // rather than full marks — which is what happens without the subtraction
    // and is the classic way multi-select becomes free points.
    return ratio(hits - misses, correctIds.size)
  },

  TRUE_FALSE(payload, answer) {
    const given = answer?.value ?? answer
    if (typeof given !== 'boolean') return 0
    return given === Boolean(payload.correct) ? 1 : 0
  },

  SHORT_ANSWER(payload, answer) {
    const caseSensitive = Boolean(payload.caseSensitive)
    const given = normalizeText(answer?.text ?? answer, caseSensitive)
    if (!given) return 0
    return asArray(payload.accepted).some((accepted) => normalizeText(accepted, caseSensitive) === given) ? 1 : 0
  },

  NUMERIC(payload, answer) {
    const given = Number(answer?.value ?? answer)
    if (!Number.isFinite(given)) return 0
    const expected = Number(payload.value)
    if (!Number.isFinite(expected)) return 0
    // Tolerance defaults to zero, i.e. exact. A physics answer of 9.8 and a
    // learner's 9.81 differ, and only the author knows whether that matters.
    const tolerance = Math.abs(Number(payload.tolerance) || 0)
    return Math.abs(given - expected) <= tolerance ? 1 : 0
  },

  MATCHING(payload, answer, { partialCredit }) {
    const pairs = asArray(payload.pairs)
    if (!pairs.length) return 0
    // Accepts either [{left, right}] or { left: right } — the editor sends
    // the first, an API client is likely to send the second.
    const given = new Map(
      Array.isArray(answer?.pairs ?? answer)
        ? asArray(answer?.pairs ?? answer).map((pair) => [normalizeText(pair.left), normalizeText(pair.right)])
        : Object.entries(answer ?? {}).map(([left, right]) => [normalizeText(left), normalizeText(right)])
    )

    const correct = pairs.filter((pair) => given.get(normalizeText(pair.left)) === normalizeText(pair.right)).length
    if (!partialCredit) return correct === pairs.length ? 1 : 0
    return ratio(correct, pairs.length)
  },

  SEQUENCE(payload, answer, { partialCredit }) {
    const items = asArray(payload.items)
    if (!items.length) return 0
    const given = asArray(answer?.items ?? answer)

    const inPlace = items.filter((item, index) => normalizeText(given[index]) === normalizeText(item)).length
    if (!partialCredit) return inPlace === items.length && given.length === items.length ? 1 : 0
    return ratio(inPlace, items.length)
  },

  FILL_BLANK(payload, answer, { partialCredit }) {
    const blanks = asArray(payload.blanks)
    if (!blanks.length) return 0
    const given = asArray(answer?.blanks ?? answer)

    const filled = blanks.filter((blank, index) => {
      const caseSensitive = Boolean(blank.caseSensitive ?? payload.caseSensitive)
      const value = normalizeText(given[index], caseSensitive)
      if (!value) return false
      return asArray(blank.accepted).some((accepted) => normalizeText(accepted, caseSensitive) === value)
    }).length

    if (!partialCredit) return filled === blanks.length ? 1 : 0
    return ratio(filled, blanks.length)
  },

  SELECT_LIST(payload, answer, { partialCredit }) {
    const blanks = asArray(payload.blanks)
    if (!blanks.length) return 0
    const given = asArray(answer?.blanks ?? answer)

    const correct = blanks.filter((blank, index) => Number(given[index]) === Number(blank.correctIndex)).length
    if (!partialCredit) return correct === blanks.length ? 1 : 0
    return ratio(correct, blanks.length)
  },

  HOTSPOT(payload, answer, { partialCredit }) {
    const areas = asArray(payload.areas)
    const targets = areas.filter((area) => area.isCorrect)
    if (!targets.length) return 0

    const clicks = asArray(answer?.points ?? answer)
    const within = (area, point) =>
      Number(point?.x) >= area.x &&
      Number(point?.x) <= area.x + area.w &&
      Number(point?.y) >= area.y &&
      Number(point?.y) <= area.y + area.h

    // Counted per target area, not per click: two clicks inside the same
    // correct region is one thing found, not two.
    const found = targets.filter((area) => clicks.some((point) => within(area, point))).length
    const strays = clicks.filter((point) => !areas.some((area) => within(area, point))).length

    if (!partialCredit) return found === targets.length && strays === 0 ? 1 : 0
    return ratio(found - strays, targets.length)
  },

  LIKERT() {
    // A survey item. There is no correct answer, so it is worth nothing and
    // must not drag the score down either — `max` is forced to zero in
    // gradeQuestion so it drops out of the percentage entirely.
    return 0
  },

  DRAG_DROP(payload, answer, { partialCredit }) {
    const items = asArray(payload.items)
    if (!items.length) return 0
    const placements = new Map(
      asArray(answer?.placements ?? answer).map((placement) => [
        String(placement.itemId),
        String(placement.zoneId ?? ''),
      ])
    )

    const placed = items.filter((item) => placements.get(String(item.id)) === String(item.zoneId)).length
    if (!partialCredit) return placed === items.length ? 1 : 0
    return ratio(placed, items.length)
  },

  ESSAY() {
    // Nobody grades an essay automatically. gradeQuestion flags it for a
    // human and awards nothing until one has looked.
    return 0
  },
}

// Same payload, same rules, different editor.
graders.DRAG_WORDS = graders.DRAG_DROP

/** Types a machine cannot mark. */
export const MANUALLY_GRADED_TYPES = ['ESSAY']

/** Types that carry no score at all. */
export const UNSCORED_TYPES = ['LIKERT']

/**
 * Grades one answer.
 *
 * Returns what the attempt needs to store per question (spec §6.3
 * `perQuestion[]`): what it was worth, what was awarded, whether it counted
 * as correct, and whether a human still has to look at it.
 */
export function gradeQuestion(question, answer, { partialCredit = false } = {}) {
  const type = question?.type
  const points = Number(question?.points ?? 1)
  const max = UNSCORED_TYPES.includes(type) ? 0 : Math.max(0, points)

  if (MANUALLY_GRADED_TYPES.includes(type)) {
    return { questionId: String(question?._id ?? ''), awarded: 0, max, correct: false, needsReview: true }
  }
  if (UNSCORED_TYPES.includes(type)) {
    return { questionId: String(question?._id ?? ''), awarded: 0, max: 0, correct: true, needsReview: false }
  }

  const grader = graders[type]
  // An unknown type is not a crash and not a free point: it is zero, and
  // flagged for a human, because the alternative is a silent wrong mark on
  // a question nobody can see is broken.
  if (!grader) {
    return { questionId: String(question?._id ?? ''), awarded: 0, max, correct: false, needsReview: true }
  }

  let share = 0
  try {
    share = grader(question.payload ?? {}, answer, { partialCredit })
  } catch {
    share = 0
  }
  share = Math.min(1, Math.max(0, Number(share) || 0))

  let awarded = share * max
  // Negative marking applies to a wholly wrong answer, not to a partially
  // right one — penalising someone who got three of four pairs would make
  // partial credit worse than not answering.
  if (share === 0 && question.penalty > 0) awarded = -Math.abs(Number(question.penalty))

  return {
    questionId: String(question?._id ?? ''),
    awarded: Math.round(awarded * 100) / 100,
    max,
    // "Correct" means fully correct. A partially credited answer scores
    // something and is still not a right answer, which is what the review
    // screen and the per-question statistics both need to say.
    correct: share === 1,
    needsReview: false,
  }
}

/**
 * Grades a whole attempt.
 *
 * The percentage is over the points actually available: unscored survey
 * items are already excluded by `max: 0`, and a negative total (possible
 * with penalties) is reported as zero rather than as a negative percentage.
 */
export function gradeAttempt(questions, answersByQuestionId, { partialCredit = false } = {}) {
  const perQuestion = questions.map((question) =>
    gradeQuestion(question, answersByQuestionId?.[String(question._id)], { partialCredit })
  )

  const maxTotal = perQuestion.reduce((sum, row) => sum + row.max, 0)
  const awardedTotal = perQuestion.reduce((sum, row) => sum + row.awarded, 0)
  const needsReview = perQuestion.some((row) => row.needsReview)

  return {
    perQuestion,
    awarded: Math.round(awardedTotal * 100) / 100,
    max: maxTotal,
    scorePercent: maxTotal > 0 ? Math.max(0, Math.round((awardedTotal / maxTotal) * 100)) : 0,
    // A test with an essay in it is not finished when the timer stops. The
    // score so far is real; it is simply not final.
    needsReview,
  }
}
