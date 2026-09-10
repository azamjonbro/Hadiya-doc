// 14.2 — the full grading grid: every question type, in every state it has.
//
// `questionGrading.test.js` already checks the grader functions against
// hand-built plain objects. This file is deliberately not that. Two things
// are different, and both are the reason it exists:
//
//   1. The questions are *real documents*. Each payload is first put through
//      `createQuestionSchema` — the same validator the API uses, so nothing
//      here is a shape the platform would refuse — then saved to Mongo and
//      read back before it is graded. `payload` is a Mixed field, and Mixed
//      is exactly where a nested array quietly becomes something else on the
//      way through mongoose. A grader that works on a literal and fails on
//      the stored document is a grader that fails in production only.
//
//   2. The grid is closed. `CASES` is asserted to name every type in
//      QUESTION_TYPES, so adding a type to the model without adding it here
//      fails this file rather than shipping ungraded.
//
// The three states, per the checklist: correct / wrong / partial. Not every
// type has a partial state — a true/false answer cannot be half true — and
// for those the assertion is that turning partial credit on changes nothing,
// which is the honest version of the third column rather than an invented
// one.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Question, QUESTION_TYPES } from '../src/models/question.model.js'
import { QuestionBank } from '../src/models/questionBank.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { createQuestionSchema } from '../src/validators/question.validator.js'
import { gradeQuestion, gradeAttempt } from '../src/services/questions/questionGrading.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const POINTS = 10

let author
let bank
// The saved documents, by type. Populated in `before`, read by every test.
const saved = {}

/**
 * The grid.
 *
 * `partial` is the answer that is *some* of the way there, with what it must
 * be worth when partial credit is on. `partial: null` means the type has no
 * such state, and `nearMiss` is then the answer that looks like it might
 * deserve one — it must still score zero with the flag on.
 */
const CASES = {
  SINGLE_CHOICE: {
    payload: {
      options: [
        { id: 'a', text: 'Ishni to\'xtatish', isCorrect: true },
        { id: 'b', text: 'Davom etish' },
        { id: 'c', text: 'Rahbarga aytmaslik' },
      ],
    },
    correct: { optionId: 'a' },
    wrong: { optionId: 'c' },
    // One answer, one box. There is no fraction of "picked the right one".
    partial: null,
    nearMiss: { optionId: 'b' },
  },

  MULTI_CHOICE: {
    payload: {
      options: [
        { id: 'a', text: 'Kaska', isCorrect: true },
        { id: 'b', text: 'Qo\'lqop', isCorrect: true },
        { id: 'c', text: 'Soyabon' },
        { id: 'd', text: 'Telefon' },
      ],
    },
    correct: { optionIds: ['a', 'b'] },
    wrong: { optionIds: ['c', 'd'] },
    partial: { answer: { optionIds: ['a'] }, awarded: 5 },
  },

  TRUE_FALSE: {
    payload: { correct: true },
    correct: { value: true },
    wrong: { value: false },
    partial: null,
    // A string is not a boolean, and coercing it would make "false" true.
    nearMiss: { value: 'true' },
  },

  SHORT_ANSWER: {
    payload: { accepted: ['Mehnat muhofazasi', 'OSH'] },
    // Spacing and case are normalised, so this is the same answer typed by
    // a human rather than a different one.
    correct: { text: '  mehnat   muhofazasi ' },
    wrong: { text: 'Yong\'in xavfsizligi' },
    partial: null,
    // Half the phrase is not half the answer: nothing in the payload says
    // which half was the point.
    nearMiss: { text: 'Mehnat' },
  },

  NUMERIC: {
    payload: { value: 9.8, tolerance: 0.05 },
    correct: { value: 9.81 },
    wrong: { value: 42 },
    partial: null,
    // Just outside the tolerance the author chose. Close is the author's
    // word to define, and they defined it as 0.05.
    nearMiss: { value: 9.9 },
  },

  MATCHING: {
    payload: {
      pairs: [
        { left: 'Yong\'in', right: 'O\'chirgich' },
        { left: 'Balandlik', right: 'Arqon' },
        { left: 'Shovqin', right: 'Quloqchin' },
        { left: 'Chang', right: 'Respirator' },
      ],
    },
    correct: {
      pairs: [
        { left: 'Yong\'in', right: 'O\'chirgich' },
        { left: 'Balandlik', right: 'Arqon' },
        { left: 'Shovqin', right: 'Quloqchin' },
        { left: 'Chang', right: 'Respirator' },
      ],
    },
    wrong: {
      pairs: [
        { left: 'Yong\'in', right: 'Arqon' },
        { left: 'Balandlik', right: 'O\'chirgich' },
        { left: 'Shovqin', right: 'Respirator' },
        { left: 'Chang', right: 'Quloqchin' },
      ],
    },
    partial: {
      answer: {
        pairs: [
          { left: 'Yong\'in', right: 'O\'chirgich' },
          { left: 'Balandlik', right: 'Arqon' },
          { left: 'Shovqin', right: 'Respirator' },
          { left: 'Chang', right: 'Quloqchin' },
        ],
      },
      awarded: 5,
    },
  },

  SEQUENCE: {
    payload: { items: ['To\'xtat', 'Uzib qo\'y', 'Tekshir', 'Ishla'] },
    correct: { items: ['To\'xtat', 'Uzib qo\'y', 'Tekshir', 'Ishla'] },
    // Reversed: nothing lands in its own place.
    wrong: { items: ['Ishla', 'Tekshir', 'Uzib qo\'y', 'To\'xtat'] },
    partial: { answer: { items: ['To\'xtat', 'Uzib qo\'y', 'Ishla', 'Tekshir'] }, awarded: 5 },
  },

  FILL_BLANK: {
    payload: {
      template: '{{1}} kiy va {{2}} ni tekshir.',
      blanks: [{ accepted: ['kaska', 'qattiq shlyapa'] }, { accepted: ['arqon'] }],
    },
    correct: { blanks: ['Qattiq shlyapa', 'arqon'] },
    wrong: { blanks: ['ko\'zoynak', 'chelak'] },
    partial: { answer: { blanks: ['kaska', 'chelak'] }, awarded: 5 },
  },

  SELECT_LIST: {
    payload: {
      blanks: [
        { options: ['qizil', 'yashil', 'ko\'k'], correctIndex: 1 },
        { options: ['yuqoriga', 'pastga'], correctIndex: 0 },
      ],
    },
    correct: { blanks: [1, 0] },
    wrong: { blanks: [0, 1] },
    partial: { answer: { blanks: [1, 1] }, awarded: 5 },
  },

  HOTSPOT: {
    payload: {
      imageKey: `sxema-${stamp}.png`,
      areas: [
        { x: 10, y: 10, w: 20, h: 20, isCorrect: true },
        { x: 60, y: 60, w: 20, h: 20, isCorrect: true },
        // A decoy: a real region of the picture that is not an answer.
        { x: 40, y: 10, w: 10, h: 10 },
      ],
    },
    correct: { points: [{ x: 15, y: 15 }, { x: 70, y: 70 }] },
    wrong: { points: [{ x: 45, y: 15 }] },
    partial: { answer: { points: [{ x: 15, y: 15 }] }, awarded: 5 },
  },

  LIKERT: {
    kind: 'UNSCORED',
    payload: { scale: 5, labels: ['Umuman yo\'q', 'Yo\'q', 'Bilmayman', 'Ha', 'Albatta'] },
    correct: { value: 5 },
    wrong: { value: 1 },
    partial: null,
    nearMiss: { value: 3 },
  },

  DRAG_DROP: {
    payload: {
      zones: [
        { id: 'ppe', label: 'Himoya vositalari' },
        { id: 'tool', label: 'Asboblar' },
      ],
      items: [
        { id: 'i1', text: 'Kaska', zoneId: 'ppe' },
        { id: 'i2', text: 'Kalit', zoneId: 'tool' },
      ],
    },
    correct: { placements: [{ itemId: 'i1', zoneId: 'ppe' }, { itemId: 'i2', zoneId: 'tool' }] },
    wrong: { placements: [{ itemId: 'i1', zoneId: 'tool' }, { itemId: 'i2', zoneId: 'ppe' }] },
    partial: {
      answer: { placements: [{ itemId: 'i1', zoneId: 'ppe' }, { itemId: 'i2', zoneId: 'ppe' }] },
      awarded: 5,
    },
  },

  // The thirteenth type is the same payload with a different editor, so it
  // is graded by the same function — which is precisely why it is in the
  // grid: an alias that stops being an alias is a silent regression.
  DRAG_WORDS: {
    payload: {
      zones: [
        { id: 'subj', label: 'Ega' },
        { id: 'obj', label: 'To\'ldiruvchi' },
      ],
      items: [
        { id: 'w1', text: 'Ishchi', zoneId: 'subj' },
        { id: 'w2', text: 'kaskani', zoneId: 'obj' },
      ],
    },
    correct: { placements: [{ itemId: 'w1', zoneId: 'subj' }, { itemId: 'w2', zoneId: 'obj' }] },
    wrong: { placements: [{ itemId: 'w1', zoneId: 'obj' }, { itemId: 'w2', zoneId: 'subj' }] },
    partial: {
      answer: { placements: [{ itemId: 'w1', zoneId: 'subj' }, { itemId: 'w2', zoneId: 'subj' }] },
      awarded: 5,
    },
  },

  ESSAY: {
    kind: 'MANUAL',
    payload: { minWords: 50 },
    correct: { text: 'A thorough and entirely correct answer about lockout procedure.' },
    wrong: { text: 'no' },
    partial: null,
    nearMiss: { text: 'Half of an answer' },
  },
}

const awardedFor = (type, answer, options) => gradeQuestion(saved[type], answer, options).awarded
const partialOn = { partialCredit: true }

describe('grading · every question type, every state (14.2)', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    author = await User.create({
      firstName: 'Grid',
      lastName: 'Author',
      fullName: 'Grid Author',
      jshshir: `41${stamp}0`,
      passwordHash: await hashPassword('GradingTest123!'),
      roleId: employeeRole._id,
    })
    bank = await QuestionBank.create({ name: `Grading grid ${stamp}`, createdBy: author._id })

    for (const [type, spec] of Object.entries(CASES)) {
      // Through the API's own validator first. A payload this refuses could
      // never reach the grader in production, so grading it here would be
      // testing a state that does not exist.
      const validated = createQuestionSchema.parse({
        bankId: bank._id.toString(),
        type,
        text: `${type} savoli ${stamp}`,
        points: POINTS,
        payload: spec.payload,
      })
      await Question.create({ ...validated, bankId: bank._id, createdBy: author._id })
      // Read back rather than kept from create(): the point is to grade what
      // Mongo returns, Mixed field and all.
      saved[type] = await Question.findOne({ bankId: bank._id, type }).lean()
      assert.ok(saved[type], `${type} was not stored`)
    }
  })

  after(async () => {
    await Question.deleteMany({ bankId: bank._id })
    await QuestionBank.deleteOne({ _id: bank._id })
    await User.deleteOne({ _id: author._id })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the grid is closed', () => {
    test('every type the model allows is in the grid', () => {
      // Adding a type to QUESTION_TYPES and forgetting it here would leave
      // it graded by nothing and noticed by nobody.
      assert.deepEqual(Object.keys(CASES).sort(), [...QUESTION_TYPES].sort())
    })

    test('a Mixed payload survives the round trip through Mongo', () => {
      // The nested-array types are where Mixed goes wrong: mongoose does not
      // track them, and a shape that changes on save grades everybody wrong
      // while every unit test on literals still passes.
      assert.deepEqual(saved.MATCHING.payload.pairs, CASES.MATCHING.payload.pairs)
      assert.deepEqual(saved.DRAG_DROP.payload.items, CASES.DRAG_DROP.payload.items)
      assert.deepEqual(saved.HOTSPOT.payload.areas.length, 3)
      assert.equal(saved.SELECT_LIST.payload.blanks[0].correctIndex, 1)
    })
  })

  for (const [type, spec] of Object.entries(CASES)) {
    const kind = spec.kind ?? 'SCORED'

    describe(type, () => {
      if (kind === 'SCORED') {
        test(`${type} · a correct answer scores full marks`, () => {
          const result = gradeQuestion(saved[type], spec.correct)
          assert.equal(result.awarded, POINTS)
          assert.equal(result.max, POINTS)
          assert.equal(result.correct, true)
          assert.equal(result.needsReview, false)
          assert.equal(result.questionId, String(saved[type]._id))
        })

        test(`${type} · a wrong answer scores nothing`, () => {
          const result = gradeQuestion(saved[type], spec.wrong)
          assert.equal(result.awarded, 0)
          assert.equal(result.correct, false)
          assert.equal(result.needsReview, false)
        })

        test(`${type} · an unanswered question scores nothing rather than throwing`, () => {
          // Submissions arrive from a browser with fields missing. Throwing
          // here loses every other answer in the same submission.
          assert.equal(awardedFor(type, undefined), 0)
          assert.equal(awardedFor(type, null, partialOn), 0)
        })
      }

      if (kind === 'UNSCORED') {
        test(`${type} · carries no score, in either direction`, () => {
          // A survey item must not lower the percentage of a learner who
          // answered every real question correctly.
          const high = gradeQuestion(saved[type], spec.correct)
          const low = gradeQuestion(saved[type], spec.wrong)
          for (const result of [high, low]) {
            assert.equal(result.max, 0)
            assert.equal(result.awarded, 0)
            assert.equal(result.needsReview, false)
          }
        })

        test(`${type} · there is no wrong answer to get wrong`, () => {
          assert.equal(gradeQuestion(saved[type], spec.wrong).correct, true)
        })
      }

      if (kind === 'MANUAL') {
        test(`${type} · a good answer waits for a human instead of being marked correct`, () => {
          const result = gradeQuestion(saved[type], spec.correct)
          assert.equal(result.needsReview, true)
          assert.equal(result.awarded, 0)
          assert.equal(result.correct, false)
          // The points still exist — they are simply not awarded yet, which
          // is what stops an essay quietly shrinking the paper it is on.
          assert.equal(result.max, POINTS)
        })

        test(`${type} · a poor answer is also left for a human, not auto-failed`, () => {
          assert.equal(gradeQuestion(saved[type], spec.wrong).needsReview, true)
        })
      }

      if (spec.partial) {
        test(`${type} · a partly right answer earns part of the marks`, () => {
          const result = gradeQuestion(saved[type], spec.partial.answer, partialOn)
          assert.equal(result.awarded, spec.partial.awarded)
          assert.ok(result.awarded > 0 && result.awarded < POINTS, 'a partial score must be strictly between')
          // Part of the marks is not a correct answer. The review screen and
          // the per-question statistics both depend on this distinction.
          assert.equal(result.correct, false)
        })

        test(`${type} · the same answer earns nothing when partial credit is off`, () => {
          // Partial credit is a per-quiz pedagogical choice. Leaking it into
          // an all-or-nothing test hands out marks the author refused.
          assert.equal(awardedFor(type, spec.partial.answer), 0)
        })
      } else {
        test(`${type} · has no partial state — the flag changes nothing`, () => {
          // Asserted rather than invented: a near-miss on a type with one
          // indivisible answer is a miss, with the flag on or off.
          assert.equal(awardedFor(type, spec.nearMiss), awardedFor(type, spec.nearMiss, partialOn))
          assert.equal(awardedFor(type, spec.nearMiss, partialOn), 0)
        })
      }
    })
  }

  describe('a whole paper of real questions', () => {
    test('mixes the types without the survey item or the essay distorting the score', async () => {
      const questions = QUESTION_TYPES.map((type) => saved[type])
      const answers = Object.fromEntries(
        QUESTION_TYPES.map((type) => [String(saved[type]._id), CASES[type].correct])
      )
      const result = gradeAttempt(questions, answers, partialOn)

      // Thirteen of the fourteen documents are worth ten; LIKERT is worth
      // nothing at all, so the paper is 130 rather than 140.
      assert.equal(result.max, (QUESTION_TYPES.length - 1) * POINTS)
      // Everything scored except the essay, which nobody has read yet.
      assert.equal(result.awarded, (QUESTION_TYPES.length - 2) * POINTS)
      assert.equal(result.needsReview, true, 'the essay must hold the paper open')
      assert.equal(result.perQuestion.length, QUESTION_TYPES.length)
    })

    test('a paper answered wrongly throughout scores zero, not a negative', () => {
      const questions = QUESTION_TYPES.map((type) => saved[type])
      const answers = Object.fromEntries(
        QUESTION_TYPES.map((type) => [String(saved[type]._id), CASES[type].wrong])
      )
      const result = gradeAttempt(questions, answers, partialOn)
      assert.equal(result.awarded, 0)
      assert.equal(result.scorePercent, 0)
    })
  })
})
