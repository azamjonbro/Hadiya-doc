import { QuizAttempt } from '../../models/quizAttempt.model.js'
import { TestQuiz } from '../../models/testQuiz.model.js'
import { Question } from '../../models/question.model.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * What a test is worth once, and how much of it the learner may see.
 *
 * Two decisions live here, and both were previously nowhere: the legacy
 * models only ever read the newest attempt and always showed everything.
 *
 * `scorePolicy` answers "which attempt counts". LAST is what the old
 * behaviour amounted to. BEST is what most training wants — the point is
 * that they learned it, not that it took three goes. FIRST is what a
 * certification body wants. AVERAGE exists because some do.
 *
 * `revealMode` answers "how much do they see afterwards". Showing the
 * correct answers straight after submission is right for practice and wrong
 * for anything retakeable: a learner fails, reads the answer key, and
 * retakes it knowing everything. That is not a hypothetical — it is the
 * default behaviour of both legacy models today.
 */

export function effectiveScore(policy, attempts) {
  const scored = attempts.filter((attempt) => !attempt.needsReview)
  if (!scored.length) return null

  // Oldest first, so FIRST and LAST mean what they say regardless of how
  // the caller happened to sort.
  const ordered = [...scored].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  switch (policy) {
    case 'BEST':
      return ordered.reduce((best, attempt) => Math.max(best, attempt.scorePercent), 0)
    case 'FIRST':
      return ordered[0].scorePercent
    case 'AVERAGE': {
      const total = ordered.reduce((sum, attempt) => sum + attempt.scorePercent, 0)
      // Rounded once, at the end. Averaging rounded numbers drifts.
      return Math.round(total / ordered.length)
    }
    case 'LAST':
    default:
      return ordered[ordered.length - 1].scorePercent
  }
}

/**
 * Whether this attempt's answers may be shown back.
 *
 * `attemptsUsed` is the count *including* this one, and `maxAttempts` of 0
 * means unlimited — under which AFTER_LAST_ATTEMPT would never reveal
 * anything, so it falls back to revealing once the test has been passed.
 * A rule that can never be satisfied is a bug, not a strict policy.
 */
export function canReveal(quiz, attempt, attemptsUsed) {
  switch (quiz?.revealMode) {
    case 'NEVER':
      return false
    case 'AFTER_PASS':
      return Boolean(attempt?.passed)
    case 'AFTER_LAST_ATTEMPT':
      if (!quiz.maxAttempts) return Boolean(attempt?.passed)
      return attemptsUsed >= quiz.maxAttempts || Boolean(attempt?.passed)
    case 'AFTER_SUBMIT':
    default:
      return true
  }
}

export const quizResultService = {
  /** The learner's standing on one test: every attempt, and what counts. */
  async summaryFor(userId, quizId) {
    const quiz = await TestQuiz.findById(quizId).lean()
    if (!quiz) throw ApiError.notFound('Test not found')

    const attempts = await QuizAttempt.find({ userId, testQuizId: quizId }).sort({ attemptNo: 1 }).lean()
    const score = effectiveScore(quiz.scorePolicy, attempts)

    return {
      quizId: String(quiz._id),
      title: quiz.title,
      scorePolicy: quiz.scorePolicy,
      attemptsUsed: attempts.length,
      maxAttempts: quiz.maxAttempts,
      attemptsLeft: quiz.maxAttempts ? Math.max(0, quiz.maxAttempts - attempts.length) : null,
      scorePercent: score,
      // Passing is judged on the score that counts, not on whether any
      // attempt happened to pass — otherwise FIRST and AVERAGE would be
      // decorative.
      passed: score !== null && score >= (quiz.passScorePercent ?? 70),
      awaitingReview: attempts.some((attempt) => attempt.needsReview),
      attempts: attempts.map((attempt) => ({
        id: String(attempt._id),
        attemptNo: attempt.attemptNo,
        scorePercent: attempt.scorePercent,
        passed: attempt.passed,
        needsReview: attempt.needsReview,
        createdAt: attempt.createdAt,
      })),
    }
  },

  /**
   * One attempt, question by question.
   *
   * When the test's reveal rule does not allow it, the marks per question
   * are still returned — the learner is entitled to know which ones they
   * lost — but the correct answer and the explanation are withheld. Hiding
   * the marks as well would leave somebody unable to tell a failed test
   * from a broken one.
   */
  async reviewFor(actor, attemptId) {
    const attempt = await QuizAttempt.findById(attemptId).lean()
    if (!attempt) throw ApiError.notFound('Attempt not found')
    if (String(attempt.userId) !== String(actor.id) && !actor.permissions?.includes('quiz:grade')) {
      throw ApiError.forbidden('Not your attempt')
    }

    const quiz = await TestQuiz.findById(attempt.testQuizId).lean()
    const attemptsUsed = await QuizAttempt.countDocuments({
      userId: attempt.userId,
      testQuizId: attempt.testQuizId,
    })
    // Somebody with quiz:grade is looking at it in order to mark it, so the
    // reveal rule — which exists to stop a learner farming the answer key —
    // does not apply to them.
    const reveal =
      actor.permissions?.includes('quiz:grade') || canReveal(quiz, attempt, attemptsUsed)

    const questions = await Question.find({
      _id: { $in: attempt.perQuestion.map((row) => row.questionId) },
    }).lean()
    const questionById = new Map(questions.map((question) => [String(question._id), question]))
    const answerById = new Map(attempt.answers.map((answer) => [String(answer.questionId), answer]))

    return {
      attemptId: String(attempt._id),
      attemptNo: attempt.attemptNo,
      scorePercent: attempt.scorePercent,
      passed: attempt.passed,
      needsReview: attempt.needsReview,
      revealed: reveal,
      questions: attempt.perQuestion.map((row) => {
        const question = questionById.get(String(row.questionId))
        return {
          questionId: String(row.questionId),
          text: question?.text ?? '',
          type: question?.type ?? '',
          awarded: row.awarded,
          max: row.max,
          correct: row.correct,
          yourAnswer: answerById.get(String(row.questionId))?.payload ?? null,
          // The two things the reveal rule actually governs.
          explanation: reveal ? question?.explanation ?? '' : '',
          correctAnswer: reveal ? correctAnswerOf(question) : null,
        }
      }),
    }
  },
}

/** The answer key for one question, in the shape its type reads. */
function correctAnswerOf(question) {
  const payload = question?.payload ?? {}
  switch (question?.type) {
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE':
      return (payload.options ?? []).filter((option) => option.isCorrect).map((option) => option.text)
    case 'TRUE_FALSE':
      return payload.correct
    case 'SHORT_ANSWER':
      return payload.accepted ?? []
    case 'NUMERIC':
      return payload.tolerance ? `${payload.value} ±${payload.tolerance}` : payload.value
    case 'MATCHING':
      return payload.pairs ?? []
    case 'SEQUENCE':
      return payload.items ?? []
    case 'FILL_BLANK':
      return (payload.blanks ?? []).map((blank) => blank.accepted?.[0] ?? '')
    case 'SELECT_LIST':
      return (payload.blanks ?? []).map((blank) => blank.options?.[blank.correctIndex] ?? '')
    case 'DRAG_DROP':
    case 'DRAG_WORDS':
      return (payload.items ?? []).map((item) => ({ text: item.text, zoneId: item.zoneId }))
    case 'HOTSPOT':
      return (payload.areas ?? []).filter((area) => area.isCorrect)
    default:
      // LIKERT has no right answer, and an essay's is a rubric.
      return null
  }
}
