// AT-09 — after M1, the old test still works.
//
//   GIVEN a Quiz and its attempts, written before the migration
//   WHEN  M1 runs, then GET /videos/:id/quiz and
//         GET /videos/:id/quiz/attempts/:userId are called
//   THEN  the questions come back with the same text in the same order, the
//         old attempts' scores and answer detail are unchanged, and the
//         legacy collections are still there
//
// The migration copies forward and never edits or renames a legacy
// document, which is the whole reason this holds. So what is worth testing
// is not that the copy exists — it is that the original is untouched and
// still readable through the endpoints that were never changed.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { Quiz } from '../src/models/quiz.model.js'
import { Assessment } from '../src/models/assessment.model.js'
import { QuizAttempt } from '../src/models/quizAttempt.model.js'
import { AssessmentAttempt } from '../src/models/assessmentAttempt.model.js'
import { AssessmentSession } from '../src/models/assessmentSession.model.js'
import { TestQuiz } from '../src/models/testQuiz.model.js'
import { TestSession } from '../src/models/testSession.model.js'
import { Question } from '../src/models/question.model.js'
import { QuestionBank } from '../src/models/questionBank.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { quizService } from '../src/services/quizzes/quiz.service.js'
import { run as runM1, questionFromLegacy } from '../src/scripts/migrateQuizzes.js'
import { run as runM5, numberAttempts } from '../src/scripts/migrateAttempts.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let learner
let admin
let course
let topic
let video
let legacyQuiz
let legacyAssessment
let attemptsBefore
let session

const QUESTION_TEXTS = ['What comes first?', 'What comes second?', 'What comes third?']

describe('AT-09 · the old test survives migration M1', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    learner = await User.create({
      firstName: 'Legacy',
      lastName: 'Learner',
      fullName: 'Legacy Learner',
      jshshir: `61${stamp}`,
      passwordHash: await hashPassword('LegacyTest123!'),
      roleId: employeeRole._id,
    })
    admin = learner

    course = await Course.create({
      title: `Legacy quiz course ${stamp}`,
      slug: `legacy-quiz-course-${stamp}`,
      createdBy: admin._id,
    })
    topic = await Topic.create({
      courseId: course._id,
      title: 'Module',
      slug: 'module',
      createdBy: admin._id,
    })
    video = await Video.create({
      courseId: course._id,
      topicId: topic._id,
      title: 'Lesson with a quiz',
      status: 'PUBLISHED',
      createdBy: admin._id,
    })

    legacyQuiz = await Quiz.create({
      videoId: video._id,
      courseId: course._id,
      passScorePercent: 60,
      questions: QUESTION_TEXTS.map((text, order) => ({
        text,
        order,
        options: [
          { text: 'Right', isCorrect: true },
          { text: 'Wrong', isCorrect: false },
        ],
      })),
      createdBy: admin._id,
    })

    legacyAssessment = await Assessment.create({
      courseId: course._id,
      topicId: topic._id,
      title: `Legacy assessment ${stamp}`,
      status: 'PUBLISHED',
      questions: [
        { text: 'Assessment question', order: 0, options: [{ text: 'Yes', isCorrect: true }, { text: 'No' }] },
      ],
      createdBy: admin._id,
    })

    // Three attempts, written in a deliberate order — M5 has to number them
    // from that order, since nothing recorded an attempt number before.
    for (const [index, percent] of [40, 70, 100].entries()) {
      await QuizAttempt.create({
        userId: learner._id,
        quizId: legacyQuiz._id,
        videoId: video._id,
        courseId: course._id,
        answers: legacyQuiz.questions.map((question, position) => ({
          questionId: question._id,
          selectedOptionIndex: position <= index ? 0 : 1,
        })),
        scorePercent: percent,
        passed: percent >= 60,
        pointsAwarded: percent === 100 ? 10 : 0,
        createdAt: new Date(Date.now() - (3 - index) * 60_000),
      })
    }

    await AssessmentAttempt.create({
      userId: learner._id,
      assessmentId: legacyAssessment._id,
      courseId: course._id,
      answers: [{ questionId: legacyAssessment.questions[0]._id, selectedOptionIndex: 0 }],
      scorePercent: 100,
      passed: true,
    })

    session = await AssessmentSession.create({
      userId: learner._id,
      assessmentId: legacyAssessment._id,
      courseId: course._id,
      startedAt: new Date(Date.now() - 5 * 60_000),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      focusLossCount: 2,
      status: 'IN_PROGRESS',
    })

    // Exactly what the endpoint would return before anything migrates.
    attemptsBefore = await quizService.getAttemptsForUser(
      { id: learner._id.toString(), permissions: [] },
      video._id.toString(),
      learner._id.toString()
    )

    await runM1()
    await runM5()
  })

  after(async () => {
    const migrated = await TestQuiz.find({ courseId: course._id }, { _id: 1 }).lean()
    const bankIds = (await QuestionBank.find({ courseId: course._id }, { _id: 1 }).lean()).map((bank) => bank._id)
    await Promise.all([
      QuizAttempt.deleteMany({ courseId: course._id }),
      AssessmentAttempt.deleteMany({ courseId: course._id }),
      AssessmentSession.deleteMany({ courseId: course._id }),
      TestSession.deleteMany({ quizId: { $in: migrated.map((row) => row._id) } }),
      TestQuiz.deleteMany({ courseId: course._id }),
      Question.deleteMany({ bankId: { $in: bankIds } }),
      QuestionBank.deleteMany({ _id: { $in: bankIds } }),
      Quiz.deleteMany({ courseId: course._id }),
      Assessment.deleteMany({ courseId: course._id }),
      Video.deleteMany({ courseId: course._id }),
      Topic.deleteMany({ courseId: course._id }),
    ])
    await Course.deleteOne({ _id: course._id })
    await User.deleteOne({ _id: learner._id })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the legacy side is untouched', () => {
    test('the legacy collections still hold their documents', async () => {
      assert.ok(await Quiz.findById(legacyQuiz._id), 'the legacy quiz must still exist')
      assert.ok(await Assessment.findById(legacyAssessment._id), 'the legacy assessment must still exist')
      assert.ok(await AssessmentSession.findById(session._id), 'the legacy sitting must still exist')
    })

    test('GET /videos/:id/quiz returns the same questions in the same order', async () => {
      const quiz = await quizService.getForVideo({ id: admin._id.toString(), permissions: [] }, video._id.toString())
      assert.deepEqual(quiz.questions.map((question) => question.text), QUESTION_TEXTS)
      assert.equal(quiz.passScorePercent, 60)
    })

    test('the old attempts read back with their scores and answer detail unchanged', async () => {
      const after = await quizService.getAttemptsForUser(
        { id: learner._id.toString(), permissions: [] },
        video._id.toString(),
        learner._id.toString()
      )
      // Compared whole, not field by field: the point of AT-09 is that
      // nothing at all about this response moved.
      assert.deepEqual(
        after.attempts.map(({ id, scorePercent, passed, pointsAwarded, answers }) => ({
          id,
          scorePercent,
          passed,
          pointsAwarded,
          answers,
        })),
        attemptsBefore.attempts.map(({ id, scorePercent, passed, pointsAwarded, answers }) => ({
          id,
          scorePercent,
          passed,
          pointsAwarded,
          answers,
        }))
      )
    })
  })

  describe('the unified side is filled in', () => {
    test('the video quiz became a VIDEO-scoped test carrying the video title', async () => {
      const migrated = await TestQuiz.findOne({ legacyKind: 'QUIZ', legacyId: legacyQuiz._id }).lean()
      assert.ok(migrated)
      assert.equal(migrated.scope, 'VIDEO')
      assert.equal(String(migrated.scopeId), String(video._id))
      assert.equal(migrated.title, 'Lesson with a quiz')
      assert.equal(migrated.passScorePercent, 60)
      assert.equal(migrated.questionIds.length, 3)
    })

    test('the assessment became a TOPIC-scoped test', async () => {
      const migrated = await TestQuiz.findOne({ legacyKind: 'ASSESSMENT', legacyId: legacyAssessment._id }).lean()
      assert.ok(migrated)
      assert.equal(migrated.scope, 'TOPIC')
      assert.equal(String(migrated.scopeId), String(topic._id))
    })

    test('questions keep their ids, so old attempts still point at them', async () => {
      // The one property that removes the need for a mapping table: a
      // legacy attempt's answers[].questionId is a real Question now.
      for (const legacyQuestion of legacyQuiz.questions) {
        const question = await Question.findById(legacyQuestion._id).lean()
        assert.ok(question, `question ${legacyQuestion._id} must exist after M1`)
        assert.equal(question.text, legacyQuestion.text)
        assert.equal(question.type, 'SINGLE_CHOICE')
        assert.equal(question.payload.options.length, 2)
        assert.equal(question.payload.options[0].isCorrect, true)
      }
    })

    test('question order is preserved on the migrated test', async () => {
      const migrated = await TestQuiz.findOne({ legacyKind: 'QUIZ', legacyId: legacyQuiz._id }).lean()
      const questions = await Question.find({ _id: { $in: migrated.questionIds } }).lean()
      const byId = new Map(questions.map((question) => [String(question._id), question]))
      assert.deepEqual(
        migrated.questionIds.map((id) => byId.get(String(id)).text),
        QUESTION_TEXTS
      )
    })

    test('nothing about the test is silently switched on', async () => {
      const migrated = await TestQuiz.findOne({ legacyKind: 'QUIZ', legacyId: legacyQuiz._id }).lean()
      // A migration that turns on shuffling, a timer or an attempt limit
      // changes what the test *is* for everyone already taking it.
      assert.equal(migrated.shuffleQuestions, false)
      assert.equal(migrated.shuffleOptions, false)
      assert.equal(migrated.partialCredit, false)
      assert.equal(migrated.maxAttempts, 0)
      assert.equal(migrated.timeLimitMinutes, 0)
      assert.equal(migrated.focusLossLimit, 0)
    })
  })

  describe('M5 · attempts and sittings', () => {
    test('attempts are numbered from the order they were written', async () => {
      const attempts = await QuizAttempt.find({ userId: learner._id, quizId: legacyQuiz._id })
        .sort({ createdAt: 1 })
        .lean()
      assert.deepEqual(attempts.map((attempt) => attempt.attemptNo), [1, 2, 3])
      // And the scores they were numbered around are exactly as written.
      assert.deepEqual(attempts.map((attempt) => attempt.scorePercent), [40, 70, 100])
    })

    test('attempts now point at the migrated test as well as the legacy one', async () => {
      const migrated = await TestQuiz.findOne({ legacyKind: 'QUIZ', legacyId: legacyQuiz._id }).lean()
      const attempt = await QuizAttempt.findOne({ userId: learner._id, quizId: legacyQuiz._id }).lean()
      assert.equal(String(attempt.testQuizId), String(migrated._id))
      // quizId is left alone — that is what keeps the old endpoint working.
      assert.equal(String(attempt.quizId), String(legacyQuiz._id))
    })

    test('an in-progress sitting keeps its original deadline', async () => {
      const carried = await TestSession.findOne({ legacyId: session._id }).lean()
      assert.ok(carried)
      assert.equal(carried.status, 'IN_PROGRESS')
      assert.equal(carried.focusLossCount, 2)
      // Recomputing this from "now" would hand a live sitting a fresh
      // timer, which is the one thing a server-side deadline prevents.
      assert.equal(carried.expiresAt.getTime(), session.expiresAt.getTime())
    })

    test('running both migrations again changes nothing', async () => {
      const before = await TestQuiz.countDocuments({ courseId: course._id })
      const questionsBefore = await Question.countDocuments({})

      await runM1()
      const counts = await runM5()

      assert.equal(await TestQuiz.countDocuments({ courseId: course._id }), before)
      assert.equal(await Question.countDocuments({}), questionsBefore)
      // A second M5 finds nothing left to write.
      assert.equal(counts.quizAttempts, 0)
      assert.equal(counts.assessmentAttempts, 0)
    })
  })

  describe('the numbering rule itself', () => {
    test('ties break on _id, so two attempts never share a number', () => {
      const sameMoment = new Date()
      const updates = numberAttempts(
        [
          { _id: 'bbb', userId: 'u', quizId: 'q', createdAt: sameMoment },
          { _id: 'aaa', userId: 'u', quizId: 'q', createdAt: sameMoment },
        ],
        (row) => `${row.userId}:${row.quizId}`
      )
      assert.deepEqual(updates.map((update) => update.attemptNo).sort(), [1, 2])
    })

    test('only rows that would change are written', () => {
      const updates = numberAttempts(
        [{ _id: 'a', userId: 'u', quizId: 'q', createdAt: new Date(), attemptNo: 1 }],
        (row) => `${row.userId}:${row.quizId}`
      )
      assert.equal(updates.length, 0)
    })
  })

  describe('the legacy question conversion', () => {
    test('a multi-correct legacy question is recorded as MULTI_CHOICE', () => {
      // The old grader only ever compared one index, so such a question was
      // already being graded wrongly. Recording what it is changes no
      // stored score; it stops the new grader repeating the mistake.
      const converted = questionFromLegacy(
        {
          _id: new mongoose.Types.ObjectId(),
          text: 'Pick two',
          options: [
            { _id: new mongoose.Types.ObjectId(), text: 'A', isCorrect: true },
            { _id: new mongoose.Types.ObjectId(), text: 'B', isCorrect: true },
            { _id: new mongoose.Types.ObjectId(), text: 'C' },
          ],
        },
        { bankId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId() }
      )
      assert.equal(converted.type, 'MULTI_CHOICE')
      assert.equal(converted.payload.options.filter((option) => option.isCorrect).length, 2)
    })
  })
})
