// 4.4 — AT-08, plus the two rules the legacy models never had:
// which attempt counts, and how much the learner is shown afterwards.
//
//   AT-08  MULTI_CHOICE, 4 options, 2 correct, points 10, partialCredit on
//          -> 1 right + 1 wrong = 0, 2 right = 10, 1 right + 0 wrong = 5
//
// The reveal rule matters more than it looks. Both legacy models always
// showed the correct answers immediately, which is right for practice and
// wrong for anything retakeable: fail, read the answer key, retake it
// knowing everything.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Question } from '../src/models/question.model.js'
import { QuestionBank } from '../src/models/questionBank.model.js'
import { TestQuiz } from '../src/models/testQuiz.model.js'
import { QuizAttempt } from '../src/models/quizAttempt.model.js'
import { Course } from '../src/models/course.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { gradeQuestion } from '../src/services/questions/questionGrading.js'
import { effectiveScore, canReveal, quizResultService } from '../src/services/quizzes/quizResult.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

const attemptsAt = (...percents) =>
  percents.map((scorePercent, index) => ({
    scorePercent,
    createdAt: new Date(2026, 0, 1, 0, index),
    needsReview: false,
  }))

let learner
let course
let bank
let question
let quiz
let attempt

describe('scoring policy and feedback (4.4)', () => {
  describe('AT-08 · partial credit on a multiple-answer question', () => {
    const q = {
      _id: 'at08',
      type: 'MULTI_CHOICE',
      points: 10,
      payload: {
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: true },
          { id: 'c', text: 'C' },
          { id: 'd', text: 'D' },
        ],
      },
    }
    const awarded = (optionIds) => gradeQuestion(q, { optionIds }, { partialCredit: true }).awarded

    test('one right and one wrong cancel out to nothing', () => assert.equal(awarded(['a', 'c']), 0))
    test('both right scores the lot', () => assert.equal(awarded(['a', 'b']), 10))
    test('one right and nothing wrong scores half', () => assert.equal(awarded(['a']), 5))
  })

  describe('which attempt counts', () => {
    const attempts = attemptsAt(40, 90, 60)

    test('LAST is the old behaviour: the newest attempt', () =>
      assert.equal(effectiveScore('LAST', attempts), 60))
    test('BEST is what most training wants', () => assert.equal(effectiveScore('BEST', attempts), 90))
    test('FIRST is what a certification body wants', () =>
      assert.equal(effectiveScore('FIRST', attempts), 40))
    test('AVERAGE rounds once, at the end', () => assert.equal(effectiveScore('AVERAGE', attempts), 63))

    test('an unknown policy falls back to LAST rather than to nothing', () =>
      assert.equal(effectiveScore('WHATEVER', attempts), 60))

    test('no attempts is null, not zero', () => {
      // Zero would read as "sat it and failed", which is a different thing
      // from "has not sat it" everywhere it is displayed.
      assert.equal(effectiveScore('BEST', []), null)
    })

    test('an attempt awaiting a human is left out of the calculation', () => {
      const pending = [...attemptsAt(80), { scorePercent: 0, createdAt: new Date(), needsReview: true }]
      assert.equal(effectiveScore('LAST', pending), 80)
    })

    test('order comes from createdAt, not from the array', () => {
      const shuffled = [attemptsAt(40, 90, 60)[2], attemptsAt(40, 90, 60)[0], attemptsAt(40, 90, 60)[1]]
      assert.equal(effectiveScore('FIRST', shuffled), 40)
      assert.equal(effectiveScore('LAST', shuffled), 60)
    })
  })

  describe('how much is revealed', () => {
    test('AFTER_SUBMIT shows it straight away', () =>
      assert.equal(canReveal({ revealMode: 'AFTER_SUBMIT' }, { passed: false }, 1), true))
    test('NEVER shows nothing, passed or not', () =>
      assert.equal(canReveal({ revealMode: 'NEVER' }, { passed: true }, 1), false))
    test('AFTER_PASS waits for a pass', () => {
      assert.equal(canReveal({ revealMode: 'AFTER_PASS' }, { passed: false }, 1), false)
      assert.equal(canReveal({ revealMode: 'AFTER_PASS' }, { passed: true }, 1), true)
    })
    test('AFTER_LAST_ATTEMPT waits until the attempts run out', () => {
      const quizWithLimit = { revealMode: 'AFTER_LAST_ATTEMPT', maxAttempts: 3 }
      assert.equal(canReveal(quizWithLimit, { passed: false }, 2), false)
      assert.equal(canReveal(quizWithLimit, { passed: false }, 3), true)
    })
    test('passing reveals it early, since there is nothing left to farm', () =>
      assert.equal(canReveal({ revealMode: 'AFTER_LAST_ATTEMPT', maxAttempts: 3 }, { passed: true }, 1), true))
    test('with unlimited attempts it falls back to AFTER_PASS instead of never', () => {
      // A rule that can never be satisfied is a bug, not a strict policy.
      const unlimited = { revealMode: 'AFTER_LAST_ATTEMPT', maxAttempts: 0 }
      assert.equal(canReveal(unlimited, { passed: false }, 99), false)
      assert.equal(canReveal(unlimited, { passed: true }, 1), true)
    })
  })

  describe('the review screen', () => {
    before(async () => {
      await connectDatabase()
      const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
      assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

      learner = await User.create({
        firstName: 'Review',
        lastName: 'Reader',
        fullName: 'Review Reader',
        jshshir: `84${stamp}`,
        passwordHash: await hashPassword('ReviewTest123!'),
        roleId: employeeRole._id,
      })
      course = await Course.create({
        title: `Review course ${stamp}`,
        slug: `review-course-${stamp}`,
        createdBy: learner._id,
      })
      bank = await QuestionBank.create({ name: `Review bank ${stamp}`, createdBy: learner._id })
      question = await Question.create({
        bankId: bank._id,
        type: 'SINGLE_CHOICE',
        text: 'Which is right?',
        explanation: 'Because the standard says so.',
        points: 10,
        payload: {
          options: [
            { id: 'a', text: 'The right one', isCorrect: true },
            { id: 'b', text: 'The wrong one' },
          ],
        },
        createdBy: learner._id,
      })
      quiz = await TestQuiz.create({
        scope: 'COURSE',
        scopeId: course._id,
        courseId: course._id,
        title: 'Reviewable test',
        questionIds: [question._id],
        revealMode: 'AFTER_PASS',
        maxAttempts: 3,
        createdBy: learner._id,
      })
      attempt = await QuizAttempt.create({
        userId: learner._id,
        quizId: quiz._id,
        courseId: course._id,
        testQuizId: quiz._id,
        attemptNo: 1,
        answers: [{ questionId: question._id, payload: { optionId: 'b' } }],
        perQuestion: [{ questionId: question._id, awarded: 0, max: 10, correct: false }],
        scorePercent: 0,
        passed: false,
      })
    })

    after(async () => {
      await Promise.all([
        QuizAttempt.deleteMany({ testQuizId: quiz._id }),
        TestQuiz.deleteOne({ _id: quiz._id }),
        Question.deleteMany({ bankId: bank._id }),
      ])
      await QuestionBank.deleteOne({ _id: bank._id })
      await Course.deleteOne({ _id: course._id })
      await User.deleteOne({ _id: learner._id })
      await mongoose.connection.close()
      await redisConnection.quit()
    })

    test('a failed attempt under AFTER_PASS shows the marks but not the answer', async () => {
      const review = await quizResultService.reviewFor(
        { id: learner._id.toString(), permissions: [] },
        attempt._id
      )
      assert.equal(review.revealed, false)
      // The marks are still there: hiding them too would leave somebody
      // unable to tell a failed test from a broken one.
      assert.equal(review.questions[0].awarded, 0)
      assert.equal(review.questions[0].max, 10)
      assert.equal(review.questions[0].correct, false)
      assert.deepEqual(review.questions[0].yourAnswer, { optionId: 'b' })
      // And the two things the rule actually governs are withheld.
      assert.equal(review.questions[0].correctAnswer, null)
      assert.equal(review.questions[0].explanation, '')
    })

    test('somebody with quiz:grade sees it, because they are marking it', async () => {
      const review = await quizResultService.reviewFor(
        { id: new mongoose.Types.ObjectId().toString(), permissions: ['quiz:grade'] },
        attempt._id
      )
      assert.equal(review.revealed, true)
      assert.deepEqual(review.questions[0].correctAnswer, ['The right one'])
      assert.equal(review.questions[0].explanation, 'Because the standard says so.')
    })

    test('somebody else’s attempt is not readable', async () => {
      await assert.rejects(
        () => quizResultService.reviewFor({ id: new mongoose.Types.ObjectId().toString(), permissions: [] }, attempt._id),
        (error) => error.statusCode === 403
      )
    })

    test('the summary reports what counts and what is left', async () => {
      const summary = await quizResultService.summaryFor(learner._id, quiz._id)
      assert.equal(summary.attemptsUsed, 1)
      assert.equal(summary.attemptsLeft, 2)
      assert.equal(summary.scorePercent, 0)
      assert.equal(summary.passed, false)
      assert.equal(summary.scorePolicy, 'LAST')
    })

    test('passing reveals the answer on the same attempt', async () => {
      await QuizAttempt.updateOne({ _id: attempt._id }, { $set: { passed: true, scorePercent: 100 } })
      const review = await quizResultService.reviewFor(
        { id: learner._id.toString(), permissions: [] },
        attempt._id
      )
      assert.equal(review.revealed, true)
      assert.equal(review.questions[0].explanation, 'Because the standard says so.')
    })
  })
})
