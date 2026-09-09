/**
 * Migration M1 — the video quiz and the topic assessment become one test.
 *
 * Both legacy collections are **left exactly as they are**. Nothing is
 * renamed, nothing is dropped, no legacy document is edited. M1 only
 * *copies forward*: each legacy quiz/assessment becomes a `TestQuiz`, and
 * each of its embedded questions becomes a `Question` in a `QuestionBank`
 * created for that course.
 *
 * That is what makes AT-09 hold. The old endpoints keep reading the old
 * collections and keep returning the same questions in the same order with
 * the same attempt history, because from their point of view nothing
 * happened. The legacy collections are dropped in a later release, once the
 * new endpoints are the ones being called.
 *
 * Idempotent by construction: every copied row records `legacyKind` and
 * `legacyId` under a unique partial index, so a second run finds the copy
 * already there and updates it in place rather than making a twin.
 *
 *   npm --prefix backend run migrate:quizzes -- --dry-run
 *   npm --prefix backend run migrate:quizzes
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { Quiz } from '../models/quiz.model.js'
import { Assessment } from '../models/assessment.model.js'
import { Video } from '../models/video.model.js'
import { Course } from '../models/course.model.js'
import { Question } from '../models/question.model.js'
import { QuestionBank } from '../models/questionBank.model.js'
import { TestQuiz } from '../models/testQuiz.model.js'

const dryRun = process.argv.includes('--dry-run')

/**
 * A legacy embedded question, as a `Question` document.
 *
 * Option ids are the option's own `_id` from the embedded array, carried
 * across unchanged. That is deliberate: a legacy attempt stored the option
 * *index*, and keeping the ids stable is what lets a later migration map
 * those indices onto ids without guessing. The order is preserved for the
 * same reason — AT-09 asks for the same questions in the same order.
 */
export function questionFromLegacy(legacyQuestion, { bankId, createdBy }) {
  const options = (legacyQuestion.options ?? []).map((option, index) => ({
    id: String(option._id ?? index),
    text: option.text,
    isCorrect: Boolean(option.isCorrect),
  }))

  // A legacy question with exactly one correct option is SINGLE_CHOICE;
  // with several it is MULTI_CHOICE. The old grader only ever compared one
  // index, so a multi-correct question was already being graded wrongly —
  // this records what it is, without changing any stored score.
  const correctCount = options.filter((option) => option.isCorrect).length

  return {
    bankId,
    type: correctCount > 1 ? 'MULTI_CHOICE' : 'SINGLE_CHOICE',
    text: legacyQuestion.text,
    points: 1,
    payload: { options },
    createdBy,
  }
}

/** The bank a course's migrated questions go into, created once per course. */
async function bankFor(courseId, courseTitle, createdBy, cache) {
  const key = String(courseId ?? 'global')
  if (cache.has(key)) return cache.get(key)

  const name = `${courseTitle ?? 'Course'} — migrated`
  let bank = await QuestionBank.findOne({ courseId: courseId ?? null, name })
  if (!bank && !dryRun) {
    bank = await QuestionBank.create({
      name,
      description: 'Created by migration M1 from the questions embedded in this course’s tests.',
      courseId: courseId ?? null,
      tags: ['migrated'],
      createdBy,
    })
  }
  cache.set(key, bank)
  return bank
}

async function migrateOne(legacy, { kind, scope, scopeId, title, createdBy, bank, counts }) {
  const existing = await TestQuiz.findOne({ legacyKind: kind, legacyId: legacy._id })

  const questionIds = []
  for (const [index, legacyQuestion] of (legacy.questions ?? []).entries()) {
    if (dryRun) {
      counts.questions += 1
      continue
    }
    // The new Question keeps the legacy embedded question's `_id`.
    //
    // That is not just convenient for re-runs — it is what makes the old
    // attempts readable against the new questions without a lookup table.
    // A legacy attempt stores `answers[].questionId`, and after this it
    // points at a real Question document with the same id and the same
    // wording.
    const created = await Question.findOneAndUpdate(
      { bankId: bank._id, _id: legacyQuestion._id },
      { $set: { ...questionFromLegacy(legacyQuestion, { bankId: bank._id, createdBy }), tags: ['migrated'] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    questionIds[index] = created._id
    counts.questions += 1
  }

  if (dryRun) {
    counts.quizzes += 1
    return
  }

  const fields = {
    scope,
    scopeId,
    courseId: legacy.courseId ?? null,
    title,
    description: legacy.description ?? '',
    questionIds,
    passScorePercent: legacy.passScorePercent ?? 70,
    pointsEnabled: legacy.pointsEnabled ?? false,
    points: legacy.points ?? 10,
    status: legacy.status ?? 'PUBLISHED',
    order: legacy.order ?? 0,
    // Every legacy default carried over as-is. A migration that quietly
    // switches on shuffling or partial credit changes what a test *is* for
    // everyone already taking it.
    maxAttempts: 0,
    timeLimitMinutes: 0,
    shuffleQuestions: false,
    shuffleOptions: false,
    partialCredit: false,
    revealMode: 'AFTER_SUBMIT',
    scorePolicy: 'LAST',
    focusLossLimit: 0,
    legacyKind: kind,
    legacyId: legacy._id,
    createdBy: legacy.createdBy ?? createdBy,
  }

  if (existing) {
    await TestQuiz.updateOne({ _id: existing._id }, { $set: fields })
    counts.updated += 1
  } else {
    await TestQuiz.create(fields)
    counts.quizzes += 1
  }
}

export async function run() {
  const counts = { quizzes: 0, updated: 0, questions: 0, skipped: 0 }
  const bankCache = new Map()

  const courses = await Course.find({}, { title: 1, createdBy: 1 }).lean()
  const courseById = new Map(courses.map((course) => [String(course._id), course]))

  const quizzes = await Quiz.find().lean()
  for (const quiz of quizzes) {
    const course = courseById.get(String(quiz.courseId))
    const video = await Video.findById(quiz.videoId, { title: 1 }).lean()
    // A quiz whose video is gone has nothing to be scoped to. Reported, not
    // silently dropped: it means the cascade left an orphan behind.
    if (!video) {
      counts.skipped += 1
      console.log(`  skipped quiz ${quiz._id}: its video no longer exists`)
      continue
    }
    const bank = await bankFor(quiz.courseId, course?.title, quiz.createdBy, bankCache)
    await migrateOne(quiz, {
      kind: 'QUIZ',
      scope: 'VIDEO',
      scopeId: quiz.videoId,
      // A legacy video quiz had no title of its own — it borrowed the
      // video's, which is exactly what it is called on screen.
      title: video.title,
      createdBy: quiz.createdBy,
      bank,
      counts,
    })
  }

  const assessments = await Assessment.find().lean()
  for (const assessment of assessments) {
    const course = courseById.get(String(assessment.courseId))
    const bank = await bankFor(assessment.courseId, course?.title, assessment.createdBy, bankCache)
    await migrateOne(assessment, {
      kind: 'ASSESSMENT',
      scope: 'TOPIC',
      scopeId: assessment.topicId,
      title: assessment.title,
      createdBy: assessment.createdBy,
      bank,
      counts,
    })
  }

  return counts
}

async function main() {
  await connectDatabase()

  const [quizCount, assessmentCount] = await Promise.all([Quiz.countDocuments(), Assessment.countDocuments()])
  console.log(`${quizCount} video quiz(zes), ${assessmentCount} topic assessment(s) to carry across`)

  const counts = await run()

  console.log(
    `\n${counts.quizzes} test(s) created, ${counts.updated} updated, ` +
      `${counts.questions} question(s), ${counts.skipped} skipped`
  )
  if (dryRun) console.log('--dry-run: nothing written')

  // Said out loud because it is the property the whole migration rests on.
  const [quizzesStill, assessmentsStill] = await Promise.all([Quiz.countDocuments(), Assessment.countDocuments()])
  console.log(
    `Legacy collections untouched: quizzes ${quizzesStill}, assessments ${assessmentsStill} ` +
      '(the old endpoints keep reading these)'
  )

  await mongoose.connection.close()
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('migrateQuizzes.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
