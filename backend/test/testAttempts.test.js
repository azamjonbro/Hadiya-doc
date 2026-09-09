// AT-05, AT-06, AT-07 — attempt limits, concurrent submits, and the frozen
// paper.
//
//   AT-05  maxAttempts = 2 and two attempts used -> 409 ATTEMPTS_EXHAUSTED,
//          no new attempt row, QUIZ_ATTEMPT_BLOCKED in the audit log
//   AT-06  maxAttempts = 1 and two tabs submitting at once -> exactly one
//          attempt; the loser gets 409
//   AT-07  a pool of 50 drawn down to 10 with shuffling -> a reload returns
//          the same ten questions in the same order, and no second session
//
// AT-06 is the one that cannot be made to pass by checking harder. Both
// tabs count the attempts, both get the same number, both conclude they may
// have one more — the check and the insert are two operations. The unique
// index makes the insert the decision.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { Question } from '../src/models/question.model.js'
import { QuestionBank } from '../src/models/questionBank.model.js'
import { TestQuiz } from '../src/models/testQuiz.model.js'
import { TestSession } from '../src/models/testSession.model.js'
import { QuizAttempt } from '../src/models/quizAttempt.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { testQuizService } from '../src/services/quizzes/testQuiz.service.js'
import { seededRandom, shuffle, buildQuestionSet, toLearnerPaper } from '../src/services/questions/questionSelection.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let learner
let course
let bank
let poolQuiz
let limitedQuiz
let singleAttemptQuiz
const quizIds = []

function actorFor(user) {
  return { id: user._id.toString(), permissions: [] }
}

async function makeQuestion(index) {
  return Question.create({
    bankId: bank._id,
    type: 'SINGLE_CHOICE',
    text: `Pool question ${index}`,
    points: 1,
    payload: {
      options: [
        { id: 'a', text: 'Right', isCorrect: true },
        { id: 'b', text: 'Wrong', isCorrect: false },
      ],
    },
    createdBy: learner._id,
  })
}

describe('sitting a unified test (4.3)', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    learner = await User.create({
      firstName: 'Attempt',
      lastName: 'Taker',
      fullName: 'Attempt Taker',
      jshshir: `73${stamp}`,
      passwordHash: await hashPassword('AttemptTest123!'),
      roleId: employeeRole._id,
    })

    course = await Course.create({
      title: `Attempt course ${stamp}`,
      slug: `attempt-course-${stamp}`,
      createdBy: learner._id,
    })

    bank = await QuestionBank.create({
      name: `Attempt bank ${stamp}`,
      courseId: course._id,
      createdBy: learner._id,
    })

    // Fifty, exactly as AT-07 describes.
    for (let index = 1; index <= 50; index += 1) await makeQuestion(index)

    poolQuiz = await TestQuiz.create({
      scope: 'COURSE',
      scopeId: course._id,
      courseId: course._id,
      title: 'Pooled test',
      pools: [{ bankId: bank._id, count: 10 }],
      shuffleQuestions: true,
      status: 'PUBLISHED',
      createdBy: learner._id,
    })
    limitedQuiz = await TestQuiz.create({
      scope: 'COURSE',
      scopeId: course._id,
      courseId: course._id,
      title: 'Two attempts only',
      pools: [{ bankId: bank._id, count: 3 }],
      maxAttempts: 2,
      status: 'PUBLISHED',
      createdBy: learner._id,
    })
    singleAttemptQuiz = await TestQuiz.create({
      scope: 'COURSE',
      scopeId: course._id,
      courseId: course._id,
      title: 'One attempt only',
      pools: [{ bankId: bank._id, count: 3 }],
      maxAttempts: 1,
      status: 'PUBLISHED',
      createdBy: learner._id,
    })
    quizIds.push(poolQuiz._id, limitedQuiz._id, singleAttemptQuiz._id)

    // The unique attempt index has to exist for AT-06 to mean anything.
    await QuizAttempt.syncIndexes()
  })

  after(async () => {
    await Promise.all([
      TestSession.deleteMany({ quizId: { $in: quizIds } }),
      QuizAttempt.deleteMany({ testQuizId: { $in: quizIds } }),
      TestQuiz.deleteMany({ _id: { $in: quizIds } }),
      Question.deleteMany({ bankId: bank._id }),
      AuditLog.deleteMany({ actor: learner._id }),
    ])
    await QuestionBank.deleteOne({ _id: bank._id })
    await Course.deleteOne({ _id: course._id })
    await User.deleteOne({ _id: learner._id })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('AT-07 · the paper is drawn once and frozen', () => {
    test('a reload returns the same ten questions in the same order', async () => {
      const first = await testQuizService.start(actorFor(learner), poolQuiz._id)
      assert.equal(first.questions.length, 10)
      assert.equal(first.resumed, false)

      const second = await testQuizService.start(actorFor(learner), poolQuiz._id)
      assert.equal(second.resumed, true, 'the sitting must be resumed, not restarted')
      assert.equal(second.sessionId, first.sessionId)
      // Order included: a re-roll on reload would let somebody press F5
      // until they get an easy paper.
      assert.deepEqual(
        second.questions.map((question) => question.questionId),
        first.questions.map((question) => question.questionId)
      )
    })

    test('no second session is created', async () => {
      const sessions = await TestSession.countDocuments({ userId: learner._id, quizId: poolQuiz._id })
      assert.equal(sessions, 1)
    })

    test('the stored questionSet is what was handed out', async () => {
      const session = await TestSession.findOne({ userId: learner._id, quizId: poolQuiz._id }).lean()
      const started = await testQuizService.start(actorFor(learner), poolQuiz._id)
      assert.deepEqual(
        session.questionSet.map((entry) => String(entry.questionId)),
        started.questions.map((question) => question.questionId)
      )
      assert.ok(session.seed, 'the draw has to be reproducible from the row')
    })

    test('the paper carries no answer key', async () => {
      const started = await testQuizService.start(actorFor(learner), poolQuiz._id)
      const raw = JSON.stringify(started.questions)
      assert.ok(!raw.includes('isCorrect'), 'a test must not ship its own answers')
    })
  })

  describe('AT-05 · the attempt limit', () => {
    test('two attempts are allowed, the third is refused', async () => {
      for (let round = 0; round < 2; round += 1) {
        const started = await testQuizService.start(actorFor(learner), limitedQuiz._id)
        const answers = Object.fromEntries(
          started.questions.map((question) => [question.questionId, { optionId: 'a' }])
        )
        const result = await testQuizService.submit(actorFor(learner), started.sessionId, answers)
        assert.equal(result.attemptNo, round + 1)
        assert.equal(result.scorePercent, 100)
      }

      const before = await QuizAttempt.countDocuments({ userId: learner._id, testQuizId: limitedQuiz._id })
      assert.equal(before, 2)

      await assert.rejects(
        () => testQuizService.start(actorFor(learner), limitedQuiz._id),
        (error) => {
          assert.equal(error.statusCode, 409)
          assert.equal(error.code, 'ATTEMPTS_EXHAUSTED')
          return true
        }
      )

      // No attempt is created by being turned away — the score in the
      // report must not move.
      const after = await QuizAttempt.countDocuments({ userId: learner._id, testQuizId: limitedQuiz._id })
      assert.equal(after, 2)
    })

    test('the refusal is written to the audit log', async () => {
      const entry = await AuditLog.findOne({
        actor: learner._id,
        action: 'QUIZ_ATTEMPT_BLOCKED',
        entityId: String(limitedQuiz._id),
      }).lean()
      assert.ok(entry, 'a blocked attempt has to be traceable')
      assert.equal(entry.metadata.maxAttempts, 2)
    })
  })

  describe('AT-06 · two tabs submitting at once', () => {
    test('exactly one attempt is written, the other gets 409', async () => {
      const started = await testQuizService.start(actorFor(learner), singleAttemptQuiz._id)
      const answers = Object.fromEntries(
        started.questions.map((question) => [question.questionId, { optionId: 'a' }])
      )

      // Both tabs hold the same sitting and submit together. Both will
      // count zero existing attempts and both will decide they may write
      // attempt 1; the unique index is what stops the second.
      const results = await Promise.allSettled([
        testQuizService.submit(actorFor(learner), started.sessionId, answers),
        testQuizService.submit(actorFor(learner), started.sessionId, answers),
      ])

      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')
      assert.equal(fulfilled.length, 1, 'exactly one submission may succeed')
      assert.equal(rejected.length, 1)
      // Either the index turned it away, or it arrived after the sitting
      // had already closed. Both are correct refusals; neither writes a row.
      assert.ok(
        ['ATTEMPTS_EXHAUSTED', 'SESSION_CLOSED'].includes(rejected[0].reason.code),
        `unexpected refusal: ${rejected[0].reason.code}`
      )

      const attempts = await QuizAttempt.countDocuments({ userId: learner._id, testQuizId: singleAttemptQuiz._id })
      assert.equal(attempts, 1)
    })
  })

  describe('the seeded draw', () => {
    test('the same seed rebuilds the same paper', async () => {
      const a = await buildQuestionSet(poolQuiz.toObject(), { seed: 'fixed-seed' })
      const b = await buildQuestionSet(poolQuiz.toObject(), { seed: 'fixed-seed' })
      assert.deepEqual(
        a.questionSet.map((entry) => String(entry.questionId)),
        b.questionSet.map((entry) => String(entry.questionId))
      )
    })

    test('a different seed draws a different paper', async () => {
      const a = await buildQuestionSet(poolQuiz.toObject(), { seed: 'seed-one' })
      const b = await buildQuestionSet(poolQuiz.toObject(), { seed: 'seed-two' })
      assert.notDeepEqual(
        a.questionSet.map((entry) => String(entry.questionId)),
        b.questionSet.map((entry) => String(entry.questionId))
      )
    })

    test('a pool never draws the same question twice', async () => {
      const { questionSet } = await buildQuestionSet(poolQuiz.toObject(), { seed: 'no-repeats' })
      const ids = questionSet.map((entry) => String(entry.questionId))
      assert.equal(new Set(ids).size, ids.length)
    })

    test('a thinned-out bank produces a shorter test, not an error', async () => {
      const { questionSet, shortfalls } = await buildQuestionSet(
        { pools: [{ bankId: bank._id, count: 500 }] },
        { seed: 'short' }
      )
      assert.equal(questionSet.length, 50)
      assert.equal(shortfalls[0].short, 450)
    })

    test('the shuffle is stable for a seed and reaches every position', () => {
      const items = ['a', 'b', 'c', 'd', 'e']
      assert.deepEqual(shuffle(items, seededRandom('s')), shuffle(items, seededRandom('s')))
      assert.deepEqual([...shuffle(items, seededRandom('s'))].sort(), items)
    })
  })

  describe('what the learner is shown', () => {
    test('a SEQUENCE question is never presented in its correct order', async () => {
      const question = await Question.create({
        bankId: bank._id,
        type: 'SEQUENCE',
        text: 'Order these',
        payload: { items: ['one', 'two', 'three', 'four', 'five', 'six'] },
        createdBy: learner._id,
      })
      const quiz = { questionIds: [question._id], pools: [] }
      const { questionSet, questions } = await buildQuestionSet(quiz, { seed: 'sequence-seed' })
      const [paper] = toLearnerPaper(questions, questionSet)

      // Stored in the right order, so sending it as stored turns the
      // question into "press submit".
      assert.notDeepEqual(paper.payload.items, ['one', 'two', 'three', 'four', 'five', 'six'])
      assert.deepEqual([...paper.payload.items].sort(), ['five', 'four', 'one', 'six', 'three', 'two'])
      await Question.deleteOne({ _id: question._id })
    })

    test('a MATCHING question does not hand over the pairing', async () => {
      const question = await Question.create({
        bankId: bank._id,
        type: 'MATCHING',
        text: 'Match these',
        payload: {
          pairs: [
            { left: 'Fire', right: 'Extinguisher' },
            { left: 'Fall', right: 'Harness' },
            { left: 'Noise', right: 'Ear defenders' },
            { left: 'Dust', right: 'Mask' },
          ],
        },
        createdBy: learner._id,
      })
      const { questionSet, questions } = await buildQuestionSet(
        { questionIds: [question._id], pools: [] },
        { seed: 'matching-seed' }
      )
      const [paper] = toLearnerPaper(questions, questionSet)
      assert.deepEqual(paper.payload.left, ['Fire', 'Fall', 'Noise', 'Dust'])
      assert.notDeepEqual(paper.payload.right, ['Extinguisher', 'Harness', 'Ear defenders', 'Mask'])
      await Question.deleteOne({ _id: question._id })
    })
  })
})
