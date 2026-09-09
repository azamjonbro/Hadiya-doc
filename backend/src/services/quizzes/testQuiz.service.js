import { TestQuiz } from '../../models/testQuiz.model.js'
import { TestSession } from '../../models/testSession.model.js'
import { QuizAttempt } from '../../models/quizAttempt.model.js'
import { Question } from '../../models/question.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { gradeAttempt } from '../questions/questionGrading.js'
import { buildQuestionSet, toLearnerPaper, newSeed } from '../questions/questionSelection.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

/**
 * Sitting a unified test: starting one, and submitting it.
 *
 * Deliberately a new file rather than an addition to quiz.service.js. That
 * one serves the legacy video quiz, which has no attempt limit, no timer
 * and no pools to enforce, and it has to keep behaving exactly as it does
 * until the endpoints are switched over (AT-09). Putting both sets of rules
 * in one service is how the migration would break the thing it is meant to
 * preserve.
 */

// A submission that arrives fractionally after the deadline is a slow
// network, not cheating. Anything beyond this had time to go and look the
// answer up.
const LATE_SUBMISSION_GRACE_MS = 30 * 1000

async function completedAttempts(userId, quizId) {
  return QuizAttempt.countDocuments({ userId, testQuizId: quizId })
}

/** Tells the learner, and their manager, that the attempts have run out. */
async function announceExhausted(actor, quiz) {
  const attempts = quiz.maxAttempts
  await notificationService
    .notify({
      userId: actor.id,
      type: 'QUIZ_ATTEMPTS_EXHAUSTED',
      vars: { quizTitle: quiz.title, maxAttempts: String(attempts) },
      relatedEntityType: 'TestQuiz',
      relatedEntityId: String(quiz._id),
      severity: 'WARNING',
    })
    .catch((error) => logger.warn('Attempts-exhausted notice failed', { error: error.message }))

  // The manager hears about it too: somebody who has used every attempt on
  // a mandatory test needs help, and nobody finds that out from a report
  // they do not read.
  const user = await userRepository.findById(String(actor.id))
  if (!user?.managerId) return
  await notificationService
    .notify({
      userId: user.managerId,
      type: 'QUIZ_ATTEMPTS_EXHAUSTED',
      vars: { quizTitle: quiz.title, maxAttempts: String(attempts), userName: user.fullName },
      relatedEntityType: 'TestQuiz',
      relatedEntityId: String(quiz._id),
      severity: 'WARNING',
    })
    .catch((error) => logger.warn('Attempts-exhausted notice to the manager failed', { error: error.message }))
}

async function blocked(actor, quiz, reason) {
  await auditLogRepository.record({
    actor: actor.id,
    action: 'QUIZ_ATTEMPT_BLOCKED',
    entity: 'TestQuiz',
    entityId: String(quiz._id),
    metadata: { reason, maxAttempts: quiz.maxAttempts },
  })
  await announceExhausted(actor, quiz)
  // 409 rather than 403: the request is not forbidden to this person, it
  // conflicts with the state they are already in (AT-05).
  return ApiError.conflict('You have used every attempt at this test', 'ATTEMPTS_EXHAUSTED')
}

export const testQuizService = {
  /**
   * Starts a sitting, or returns the one already in progress.
   *
   * Returning the existing session is AT-07: a reload must hand back the
   * same questions in the same order. Generating a new set would let a
   * learner press F5 until they get an easy paper, and would leave the
   * submission with nothing to be graded against.
   */
  async start(actor, quizId) {
    const quiz = await TestQuiz.findById(quizId).lean()
    if (!quiz) throw ApiError.notFound('Test not found')

    const existing = await TestSession.findOne({ userId: actor.id, quizId, status: 'IN_PROGRESS' })
    if (existing) {
      // An expired sitting is not resumed. It is closed first, and then the
      // attempt limit decides whether there is another one to give.
      if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) {
        await this.expire(existing, quiz)
      } else {
        const questions = await Question.find({
          _id: { $in: existing.questionSet.map((entry) => entry.questionId) },
        }).lean()
        return {
          sessionId: String(existing._id),
          resumed: true,
          expiresAt: existing.expiresAt,
          questions: toLearnerPaper(questions, existing.questionSet),
        }
      }
    }

    if (quiz.maxAttempts > 0) {
      const used = await completedAttempts(actor.id, quiz._id)
      if (used >= quiz.maxAttempts) throw await blocked(actor, quiz, 'START')
    }

    const seed = newSeed()
    const { questionSet, questions, shortfalls } = await buildQuestionSet(quiz, { seed })
    if (!questionSet.length) throw ApiError.badRequest('This test has no questions yet', 'EMPTY_QUIZ')
    if (shortfalls.length) {
      // Not an error for the learner — a thinned-out bank still produces a
      // test — but the author has to be able to find out.
      logger.warn('A question pool could not supply every question it was asked for', {
        quizId: String(quiz._id),
        shortfalls,
      })
    }

    const startedAt = new Date()
    const session = await TestSession.create({
      userId: actor.id,
      quizId: quiz._id,
      courseId: quiz.courseId ?? null,
      startedAt,
      expiresAt: quiz.timeLimitMinutes
        ? new Date(startedAt.getTime() + quiz.timeLimitMinutes * 60 * 1000)
        : null,
      questionSet,
      seed,
    })

    return {
      sessionId: String(session._id),
      resumed: false,
      expiresAt: session.expiresAt,
      questions: toLearnerPaper(questions, questionSet),
    }
  },

  /** Closes a sitting whose time ran out, and records the spent attempt. */
  async expire(session, quiz) {
    session.status = 'TERMINATED'
    session.endedReason = 'TIME_EXPIRED'
    session.endedAt = new Date()
    await session.save()
    // The attempt is recorded at zero. Leaving it unrecorded would let
    // someone start a timed test, walk away, and start it again for free.
    await this.recordAttempt(session, quiz, {
      perQuestion: [],
      awarded: 0,
      max: 0,
      scorePercent: 0,
      needsReview: false,
    }, [])
  },

  /**
   * Writes the attempt, and lets the unique index be the referee.
   *
   * `attemptNo` is computed from what exists, which two concurrent
   * submissions will read identically — so the insert, not the count, is
   * what decides (AT-06). A duplicate key means the other tab got there.
   */
  async recordAttempt(session, quiz, graded, answers) {
    const used = await completedAttempts(session.userId, quiz._id)
    try {
      return await QuizAttempt.create({
        userId: session.userId,
        // Legacy field, still required by the schema. Pointed at the
        // migrated test's own id for a natively-created test, so the row is
        // never left without one.
        quizId: quiz.legacyId ?? quiz._id,
        videoId: quiz.scope === 'VIDEO' ? quiz.scopeId : null,
        courseId: quiz.courseId ?? null,
        testQuizId: quiz._id,
        sessionId: session._id,
        attemptNo: used + 1,
        answers,
        perQuestion: graded.perQuestion,
        scorePercent: graded.scorePercent,
        passed: !graded.needsReview && graded.scorePercent >= (quiz.passScorePercent ?? 70),
        needsReview: graded.needsReview,
      })
    } catch (error) {
      if (error.code === 11000) {
        throw await blocked({ id: session.userId }, quiz, 'CONCURRENT_SUBMIT')
      }
      throw error
    }
  },

  async submit(actor, sessionId, answers = {}) {
    const session = await TestSession.findById(sessionId)
    if (!session || String(session.userId) !== String(actor.id)) throw ApiError.notFound('Sitting not found')
    if (session.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest('This sitting has already ended', 'SESSION_CLOSED')
    }

    const quiz = await TestQuiz.findById(session.quizId).lean()
    if (!quiz) throw ApiError.notFound('Test not found')

    if (session.expiresAt && Date.now() > session.expiresAt.getTime() + LATE_SUBMISSION_GRACE_MS) {
      await this.expire(session, quiz)
      throw ApiError.badRequest('Time ran out before this was submitted', 'TIME_EXPIRED')
    }

    // Graded against the questions this person was actually asked, not
    // against the quiz as it stands now: an author editing the test while
    // somebody is sitting it must not change what they are marked on.
    const questions = await Question.find({
      _id: { $in: session.questionSet.map((entry) => entry.questionId) },
    }).lean()

    const graded = gradeAttempt(questions, answers, { partialCredit: quiz.partialCredit })

    const storedAnswers = session.questionSet.map((entry) => ({
      questionId: entry.questionId,
      payload: answers[String(entry.questionId)] ?? null,
    }))

    const attempt = await this.recordAttempt(session, quiz, graded, storedAnswers)

    session.status = 'SUBMITTED'
    session.endedAt = new Date()
    await session.save()

    return {
      attemptId: String(attempt._id),
      attemptNo: attempt.attemptNo,
      scorePercent: graded.scorePercent,
      awarded: graded.awarded,
      max: graded.max,
      passed: attempt.passed,
      needsReview: graded.needsReview,
      // What the learner is allowed to see afterwards is the test's
      // decision, not the endpoint's.
      perQuestion: quiz.revealMode === 'NEVER' ? [] : graded.perQuestion,
    }
  },

  /** Counts a reported focus loss, and ends the sitting if the rule says so. */
  async reportFocusLoss(actor, sessionId) {
    const session = await TestSession.findOne({ _id: sessionId, userId: actor.id, status: 'IN_PROGRESS' })
    if (!session) throw ApiError.notFound('Sitting not found')

    const quiz = await TestQuiz.findById(session.quizId).lean()
    session.focusLossCount += 1

    if (quiz?.focusLossLimit > 0 && session.focusLossCount >= quiz.focusLossLimit) {
      session.status = 'TERMINATED'
      session.endedReason = 'FOCUS_LOST'
      session.endedAt = new Date()
      await session.save()
      await this.recordAttempt(
        session,
        quiz,
        { perQuestion: [], awarded: 0, max: 0, scorePercent: 0, needsReview: false },
        []
      ).catch(() => null)
      return { focusLossCount: session.focusLossCount, terminated: true }
    }

    await session.save()
    return { focusLossCount: session.focusLossCount, terminated: false }
  },
}
