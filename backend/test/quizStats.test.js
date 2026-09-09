// 4.5 — per-question statistics, and the authoring API behind the editor.
//
// The number an author needs is the per-question pass rate, not the average
// score: that is what separates "this cohort has not learned the topic"
// from "this question is badly worded". Attempts used to store only a
// total, so neither question could be answered at all.

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
import { quizStatsService } from '../src/services/quizzes/quizStats.service.js'
import { questionService } from '../src/services/questions/question.service.js'
import { testQuizAdminService } from '../src/services/quizzes/testQuizAdmin.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let author
let course
let bank
let easy
let brutal
let quiz

describe('question statistics and authoring (4.5)', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    author = await User.create({
      firstName: 'Stat',
      lastName: 'Author',
      fullName: 'Stat Author',
      jshshir: `95${stamp}`,
      passwordHash: await hashPassword('StatTest123!'),
      roleId: employeeRole._id,
    })
    course = await Course.create({
      title: `Stats course ${stamp}`,
      slug: `stats-course-${stamp}`,
      createdBy: author._id,
    })
    bank = await QuestionBank.create({ name: `Stats bank ${stamp}`, courseId: course._id, createdBy: author._id })

    const options = [
      { id: 'a', text: 'Right', isCorrect: true },
      { id: 'b', text: 'Wrong' },
    ]
    easy = await Question.create({
      bankId: bank._id,
      type: 'SINGLE_CHOICE',
      text: 'Everyone gets this',
      difficulty: 'EASY',
      payload: { options },
      createdBy: author._id,
    })
    brutal = await Question.create({
      bankId: bank._id,
      type: 'SINGLE_CHOICE',
      text: 'Nobody gets this',
      // Declared easy, answered by almost nobody — which is the disagreement
      // the page exists to surface.
      difficulty: 'EASY',
      payload: { options },
      createdBy: author._id,
    })

    quiz = await TestQuiz.create({
      scope: 'COURSE',
      scopeId: course._id,
      courseId: course._id,
      title: 'Measured test',
      questionIds: [easy._id, brutal._id],
      createdBy: author._id,
    })

    // Ten sittings: everyone gets the first, one person gets the second.
    for (let index = 0; index < 10; index += 1) {
      const gotHard = index === 0
      await QuizAttempt.create({
        userId: new mongoose.Types.ObjectId(),
        quizId: quiz._id,
        courseId: course._id,
        testQuizId: quiz._id,
        attemptNo: 1,
        perQuestion: [
          { questionId: easy._id, awarded: 1, max: 1, correct: true },
          { questionId: brutal._id, awarded: gotHard ? 1 : 0, max: 1, correct: gotHard },
        ],
        scorePercent: gotHard ? 100 : 50,
        passed: gotHard,
      })
    }
  })

  after(async () => {
    await Promise.all([
      QuizAttempt.deleteMany({ testQuizId: quiz._id }),
      TestQuiz.deleteMany({ courseId: course._id }),
      Question.deleteMany({ bankId: bank._id }),
    ])
    await QuestionBank.deleteMany({ _id: bank._id })
    await Course.deleteOne({ _id: course._id })
    await User.deleteOne({ _id: author._id })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('statistics', () => {
    test('reports the pass rate per question, hardest first', async () => {
      const stats = await quizStatsService.forQuiz(quiz._id)
      assert.equal(stats.attempts, 10)
      assert.equal(stats.passRate, 10)
      // Hardest first: the reason anyone opens this page is to find the
      // question that is not working.
      assert.equal(stats.questions[0].questionId, String(brutal._id))
      assert.equal(stats.questions[0].correctRate, 10)
      assert.equal(stats.questions[1].correctRate, 100)
    })

    test('flags a question almost nobody gets, against its declared difficulty', async () => {
      const stats = await quizStatsService.forQuiz(quiz._id)
      const row = stats.questions[0]
      assert.equal(row.declaredDifficulty, 'EASY')
      assert.equal(row.observedDifficulty, 'HARD')
      // The disagreement is the signal, so it is flagged rather than left
      // to the reader's arithmetic.
      assert.deepEqual(stats.suspicious, [String(brutal._id)])
    })

    test('a question deleted since is still counted, and says so', async () => {
      const ghost = await Question.create({
        bankId: bank._id,
        type: 'TRUE_FALSE',
        text: 'Temporary',
        payload: { correct: true },
        createdBy: author._id,
      })
      await QuizAttempt.create({
        userId: new mongoose.Types.ObjectId(),
        quizId: quiz._id,
        courseId: course._id,
        testQuizId: quiz._id,
        attemptNo: 1,
        perQuestion: [{ questionId: ghost._id, awarded: 0, max: 1, correct: false }],
        scorePercent: 0,
      })
      await Question.deleteOne({ _id: ghost._id })

      const stats = await quizStatsService.forQuiz(quiz._id)
      const row = stats.questions.find((entry) => entry.questionId === String(ghost._id))
      // The attempt is history and stays countable; the wording is gone.
      assert.ok(row)
      assert.equal(row.text, '(deleted question)')
    })
  })

  describe('authoring guards', () => {
    test('a bank a test draws from cannot be deleted', async () => {
      const pooled = await TestQuiz.create({
        scope: 'COURSE',
        scopeId: course._id,
        courseId: course._id,
        title: 'Pooled',
        pools: [{ bankId: bank._id, count: 2 }],
        createdBy: author._id,
      })
      await assert.rejects(
        () => questionService.deleteBank({ id: author._id }, bank._id),
        (error) => error.code === 'BANK_IN_USE'
      )
      await TestQuiz.deleteOne({ _id: pooled._id })
    })

    test('a question a test names directly cannot be deleted', async () => {
      // A pool losing a question just makes the pool smaller. A questionIds
      // entry pointing at nothing is a paper with a hole in it.
      await assert.rejects(
        () => questionService.deleteQuestion({ id: author._id }, easy._id),
        (error) => error.code === 'QUESTION_IN_USE'
      )
    })

    test('a test people have sat cannot be deleted', async () => {
      // The attempts are somebody's record of passing a mandatory course,
      // and a compliance report reads them.
      await assert.rejects(
        () => testQuizAdminService.remove({ id: author._id }, quiz._id),
        (error) => error.code === 'QUIZ_HAS_ATTEMPTS'
      )
    })

    test('the authoring view resolves questions in the author’s order', async () => {
      const view = await testQuizAdminService.getById(quiz._id)
      assert.deepEqual(view.questions.map((question) => question.text), [
        'Everyone gets this',
        'Nobody gets this',
      ])
      // Fixed questions plus what the pools promise — "10 questions" is the
      // thing an author thinks they configured.
      assert.equal(view.questionCount, 2)
    })

    test('a bank reports how many questions are in it', async () => {
      const { items } = await questionService.listBanks({ courseId: String(course._id) })
      const mine = items.find((item) => item.id === String(bank._id))
      assert.equal(mine.questionCount, 2)
    })
  })
})
