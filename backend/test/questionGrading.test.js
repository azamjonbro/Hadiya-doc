// 4.1 — grading, every question type, right / wrong / partial.
//
// Pure functions and no database, deliberately: the alternative is
// exercising fourteen types through a live attempt, where one broken grader
// looks like a broken attempt endpoint. Here a failure names the type.
//
// The recurring hazards these cases pin down:
//
//   - multi-select becoming free points when ticking every box scores full
//     marks (it must not: wrong picks cancel right ones)
//   - a malformed answer from a browser throwing instead of scoring zero,
//     which fails the whole submission and loses the learner's other answers
//   - partial credit leaking into all-or-nothing tests, and vice versa
//   - an essay being silently marked wrong instead of waiting for a human
//   - a survey item dragging down a score it has no business affecting

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { QUESTION_TYPES } from '../src/models/question.model.js'
import { PAYLOAD_SCHEMAS } from '../src/validators/question.validator.js'
import { gradeQuestion, gradeAttempt } from '../src/services/questions/questionGrading.js'

const question = (type, payload, extra = {}) => ({
  _id: `q-${type}`,
  type,
  points: 10,
  payload,
  ...extra,
})

const score = (q, answer, options) => gradeQuestion(q, answer, options).awarded
const partial = { partialCredit: true }

describe('question grading (4.1)', () => {
  describe('every type has a payload shape', () => {
    test('the validator covers exactly the types the model allows', () => {
      // A type added to the model with no shape here would accept any
      // payload and then grade everyone as wrong.
      assert.deepEqual(Object.keys(PAYLOAD_SCHEMAS).sort(), [...QUESTION_TYPES].sort())
    })
  })

  describe('SINGLE_CHOICE', () => {
    const q = question('SINGLE_CHOICE', {
      options: [
        { id: 'a', text: 'Yes', isCorrect: true },
        { id: 'b', text: 'No' },
      ],
    })
    test('right', () => assert.equal(score(q, { optionId: 'a' }), 10))
    test('wrong', () => assert.equal(score(q, { optionId: 'b' }), 0))
    test('unanswered', () => assert.equal(score(q, null), 0))
  })

  describe('MULTI_CHOICE', () => {
    const q = question('MULTI_CHOICE', {
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
        { id: 'c', text: 'C' },
        { id: 'd', text: 'D' },
      ],
    })
    test('exactly right', () => assert.equal(score(q, { optionIds: ['a', 'b'] }), 10))
    test('missing one scores nothing without partial credit', () =>
      assert.equal(score(q, { optionIds: ['a'] }), 0))
    test('missing one scores half with partial credit', () =>
      assert.equal(score(q, { optionIds: ['a'] }, partial), 5))
    test('ticking everything scores nothing, not full marks', () => {
      // Without subtracting the wrong picks this is the easiest full score
      // in any test — pick every box.
      assert.equal(score(q, { optionIds: ['a', 'b', 'c', 'd'] }, partial), 0)
      assert.equal(score(q, { optionIds: ['a', 'b', 'c', 'd'] }), 0)
    })
    test('one right and one wrong nets zero, never negative', () =>
      assert.equal(score(q, { optionIds: ['a', 'c'] }, partial), 0))
  })

  describe('TRUE_FALSE', () => {
    const q = question('TRUE_FALSE', { correct: true })
    test('right', () => assert.equal(score(q, { value: true }), 10))
    test('wrong', () => assert.equal(score(q, { value: false }), 0))
    test('a string is not an answer', () => assert.equal(score(q, { value: 'true' }), 0))
  })

  describe('SHORT_ANSWER', () => {
    const q = question('SHORT_ANSWER', { accepted: ['Mehnat muhofazasi', 'OSH'] })
    test('accepts either wording', () => assert.equal(score(q, { text: 'OSH' }), 10))
    test('ignores case and stray spacing', () =>
      assert.equal(score(q, { text: '  mehnat   muhofazasi ' }), 10))
    test('respects caseSensitive when the author sets it', () => {
      const strict = question('SHORT_ANSWER', { accepted: ['OSH'], caseSensitive: true })
      assert.equal(score(strict, { text: 'osh' }), 0)
      assert.equal(score(strict, { text: 'OSH' }), 10)
    })
    test('empty is wrong', () => assert.equal(score(q, { text: '   ' }), 0))
  })

  describe('NUMERIC', () => {
    test('exact by default', () => {
      const q = question('NUMERIC', { value: 9.8 })
      assert.equal(score(q, { value: 9.8 }), 10)
      assert.equal(score(q, { value: 9.81 }), 0)
    })
    test('within tolerance', () => {
      const q = question('NUMERIC', { value: 9.8, tolerance: 0.05 })
      assert.equal(score(q, { value: 9.81 }), 10)
      assert.equal(score(q, { value: 9.9 }), 0)
    })
    test('not a number is wrong, not a crash', () => {
      const q = question('NUMERIC', { value: 5 })
      assert.equal(score(q, { value: 'five' }), 0)
    })
  })

  describe('MATCHING', () => {
    const q = question('MATCHING', {
      pairs: [
        { left: 'Fire', right: 'Extinguisher' },
        { left: 'Fall', right: 'Harness' },
        { left: 'Noise', right: 'Ear defenders' },
      ],
    })
    test('all three', () =>
      assert.equal(
        score(q, {
          pairs: [
            { left: 'Fire', right: 'Extinguisher' },
            { left: 'Fall', right: 'Harness' },
            { left: 'Noise', right: 'Ear defenders' },
          ],
        }),
        10
      ))
    test('two of three is nothing without partial credit', () =>
      assert.equal(
        score(q, {
          pairs: [
            { left: 'Fire', right: 'Extinguisher' },
            { left: 'Fall', right: 'Harness' },
            { left: 'Noise', right: 'Gloves' },
          ],
        }),
        0
      ))
    test('two of three is two thirds with it', () =>
      assert.equal(
        score(
          q,
          {
            pairs: [
              { left: 'Fire', right: 'Extinguisher' },
              { left: 'Fall', right: 'Harness' },
              { left: 'Noise', right: 'Gloves' },
            ],
          },
          partial
        ),
        6.67
      ))
    test('accepts a plain object too', () =>
      assert.equal(score(q, { Fire: 'Extinguisher', Fall: 'Harness', Noise: 'Ear defenders' }), 10))
  })

  describe('SEQUENCE', () => {
    const q = question('SEQUENCE', { items: ['Stop', 'Isolate', 'Verify', 'Work'] })
    test('right order', () => assert.equal(score(q, { items: ['Stop', 'Isolate', 'Verify', 'Work'] }), 10))
    test('two swapped is nothing without partial credit', () =>
      assert.equal(score(q, { items: ['Stop', 'Verify', 'Isolate', 'Work'] }), 0))
    test('two in place is half with it', () =>
      assert.equal(score(q, { items: ['Stop', 'Verify', 'Isolate', 'Work'] }, partial), 5))
    test('a short answer is not silently padded', () =>
      assert.equal(score(q, { items: ['Stop'] }), 0))
  })

  describe('FILL_BLANK', () => {
    const q = question('FILL_BLANK', {
      template: 'Wear a {{1}} and check the {{2}}.',
      blanks: [{ accepted: ['helmet', 'hard hat'] }, { accepted: ['harness'] }],
    })
    test('both blanks', () => assert.equal(score(q, { blanks: ['Hard Hat', 'harness'] }), 10))
    test('one blank is nothing without partial credit', () =>
      assert.equal(score(q, { blanks: ['helmet', 'rope'] }), 0))
    test('one blank is half with it', () =>
      assert.equal(score(q, { blanks: ['helmet', 'rope'] }, partial), 5))
  })

  describe('SELECT_LIST', () => {
    const q = question('SELECT_LIST', {
      blanks: [
        { options: ['red', 'green', 'blue'], correctIndex: 1 },
        { options: ['up', 'down'], correctIndex: 0 },
      ],
    })
    test('both', () => assert.equal(score(q, { blanks: [1, 0] }), 10))
    test('one, with partial credit', () => assert.equal(score(q, { blanks: [1, 1] }, partial), 5))
    test('nothing chosen', () => assert.equal(score(q, { blanks: [] }), 0))
  })

  describe('HOTSPOT', () => {
    const q = question('HOTSPOT', {
      imageKey: 'diagram.png',
      areas: [
        { x: 10, y: 10, w: 20, h: 20, isCorrect: true },
        { x: 60, y: 60, w: 20, h: 20, isCorrect: true },
        { x: 40, y: 10, w: 10, h: 10 },
      ],
    })
    test('both targets', () => assert.equal(score(q, { points: [{ x: 15, y: 15 }, { x: 70, y: 70 }] }), 10))
    test('one target, with partial credit', () =>
      assert.equal(score(q, { points: [{ x: 15, y: 15 }] }, partial), 5))
    test('a click on the decoy area costs nothing extra but is not a hit', () =>
      assert.equal(score(q, { points: [{ x: 15, y: 15 }, { x: 45, y: 15 }] }, partial), 5))
    test('a click on empty space is a stray and subtracts', () =>
      assert.equal(score(q, { points: [{ x: 15, y: 15 }, { x: 95, y: 95 }] }, partial), 0))
  })

  describe('DRAG_DROP and DRAG_WORDS', () => {
    const payload = {
      zones: [
        { id: 'ppe', label: 'PPE' },
        { id: 'tool', label: 'Tools' },
      ],
      items: [
        { id: 'i1', text: 'Helmet', zoneId: 'ppe' },
        { id: 'i2', text: 'Spanner', zoneId: 'tool' },
      ],
    }
    const dragDrop = question('DRAG_DROP', payload)
    const dragWords = question('DRAG_WORDS', payload)
    const right = { placements: [{ itemId: 'i1', zoneId: 'ppe' }, { itemId: 'i2', zoneId: 'tool' }] }
    const half = { placements: [{ itemId: 'i1', zoneId: 'ppe' }, { itemId: 'i2', zoneId: 'ppe' }] }

    test('both placed', () => assert.equal(score(dragDrop, right), 10))
    test('one placed, with partial credit', () => assert.equal(score(dragDrop, half, partial), 5))
    test('DRAG_WORDS grades identically', () => {
      assert.equal(score(dragWords, right), 10)
      assert.equal(score(dragWords, half, partial), 5)
    })
  })

  describe('LIKERT', () => {
    test('carries no score in either direction', () => {
      const result = gradeQuestion(question('LIKERT', { scale: 5 }), { value: 3 })
      // A survey item inside a quiz must not lower the percentage of a
      // learner who answered every real question correctly.
      assert.equal(result.max, 0)
      assert.equal(result.awarded, 0)
      assert.equal(result.needsReview, false)
    })
  })

  describe('ESSAY', () => {
    test('waits for a human rather than being marked wrong', () => {
      const result = gradeQuestion(question('ESSAY', { minWords: 50 }), { text: 'A long answer' })
      assert.equal(result.needsReview, true)
      assert.equal(result.awarded, 0)
      assert.equal(result.max, 10)
      assert.equal(result.correct, false)
    })
  })

  describe('defensive behaviour', () => {
    test('a malformed answer scores zero instead of throwing', () => {
      // These come from a browser. Throwing fails the whole submission and
      // loses every other answer in it.
      const cases = [
        [question('MULTI_CHOICE', { options: [{ id: 'a', isCorrect: true, text: 'A' }] }), 'not-an-array'],
        [question('MATCHING', { pairs: [{ left: 'a', right: 'b' }] }), 42],
        [question('SEQUENCE', { items: ['a', 'b'] }), { items: null }],
        [question('DRAG_DROP', { items: [{ id: 'i', zoneId: 'z' }], zones: [] }), undefined],
        [question('HOTSPOT', { areas: [{ x: 0, y: 0, w: 1, h: 1, isCorrect: true }] }), { points: 'x' }],
      ]
      for (const [q, answer] of cases) {
        assert.equal(score(q, answer, partial), 0, `${q.type} must score zero, not throw`)
      }
    })

    test('an unknown type is flagged, not silently marked wrong', () => {
      const result = gradeQuestion({ _id: 'x', type: 'HOLOGRAM', points: 5, payload: {} }, {})
      assert.equal(result.needsReview, true)
      assert.equal(result.awarded, 0)
    })

    test('a penalty applies only to a wholly wrong answer', () => {
      const q = question('MULTI_CHOICE', {
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: true },
        ],
      }, { penalty: 4 })
      // Penalising a partially right answer would make partial credit worse
      // than leaving the question blank.
      assert.equal(score(q, { optionIds: ['a'] }, partial), 5)
      assert.equal(score(q, { optionIds: [] }, partial), -4)
    })
  })

  describe('a whole attempt', () => {
    const questions = [
      question('SINGLE_CHOICE', { options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B' }] }),
      question('LIKERT', { scale: 5 }),
      question('TRUE_FALSE', { correct: false }),
    ]

    test('the survey item drops out of the percentage entirely', () => {
      const result = gradeAttempt(
        questions,
        { 'q-SINGLE_CHOICE': { optionId: 'a' }, 'q-LIKERT': { value: 2 }, 'q-TRUE_FALSE': { value: false } }
      )
      assert.equal(result.max, 20, 'only the two scored questions count')
      assert.equal(result.awarded, 20)
      assert.equal(result.scorePercent, 100)
      assert.equal(result.needsReview, false)
    })

    test('an essay leaves the attempt awaiting review', () => {
      const withEssay = [...questions, question('ESSAY', { minWords: 10 })]
      const result = gradeAttempt(withEssay, { 'q-SINGLE_CHOICE': { optionId: 'a' } })
      assert.equal(result.needsReview, true)
      // The score so far is real; it is simply not final.
      assert.equal(result.awarded, 10)
      assert.equal(result.max, 30)
    })

    test('penalties cannot produce a negative percentage', () => {
      const harsh = [question('TRUE_FALSE', { correct: true }, { penalty: 100 })]
      const result = gradeAttempt(harsh, { 'q-TRUE_FALSE': { value: false } })
      assert.equal(result.scorePercent, 0)
    })
  })
})
