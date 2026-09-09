/**
 * Migration M5 — attempts and sittings, carried onto the unified test.
 *
 * Three things, none of which changes a score anybody has already been
 * shown:
 *
 *   1. `attemptNo` is filled in from the order the attempts were written.
 *      Nothing recorded it before, because neither legacy model had an
 *      attempt limit to enforce; `maxAttempts` cannot be enforced without
 *      it, and "attempt 2 of 3" cannot be displayed.
 *   2. `testQuizId` is pointed at the test M1 created from the legacy quiz
 *      or assessment, so history survives the switch-over. `quizId` /
 *      `assessmentId` are left exactly where they are — that is what keeps
 *      the old endpoints answering (AT-09).
 *   3. `assessmentSessions` are copied into `testSessions`. Copied, not
 *      moved: an in-progress sitting must not lose its deadline mid-test.
 *
 * Scores, answers, pass flags and points are never written. Run it twice
 * and the second run reports nothing to do.
 *
 * Run after M1 — it needs the tests M1 created.
 *
 *   npm --prefix backend run migrate:attempts -- --dry-run
 *   npm --prefix backend run migrate:attempts
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { QuizAttempt } from '../models/quizAttempt.model.js'
import { AssessmentAttempt } from '../models/assessmentAttempt.model.js'
import { AssessmentSession } from '../models/assessmentSession.model.js'
import { TestQuiz } from '../models/testQuiz.model.js'
import { TestSession } from '../models/testSession.model.js'

const dryRun = process.argv.includes('--dry-run')

/**
 * Numbers a person's attempts at one test, oldest first.
 *
 * By `createdAt`, with `_id` as the tie-break: two attempts written in the
 * same millisecond are rare and not impossible, and an unstable sort would
 * hand the same person two attempts numbered 2.
 */
export function numberAttempts(rows, keyOf) {
  const byKey = new Map()
  const ordered = [...rows].sort((a, b) => {
    const byTime = new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0)
    return byTime !== 0 ? byTime : String(a._id).localeCompare(String(b._id))
  })

  const updates = []
  for (const row of ordered) {
    const key = keyOf(row)
    const next = (byKey.get(key) ?? 0) + 1
    byKey.set(key, next)
    // Only rows that would actually change are written, so a re-run is a
    // read and nothing else.
    if (row.attemptNo !== next) updates.push({ _id: row._id, attemptNo: next })
  }
  return updates
}

async function backfill(Model, keyOf, legacyKind, legacyIdField, counts, label) {
  const rows = await Model.find({}, { createdAt: 1, attemptNo: 1, userId: 1, [legacyIdField]: 1, testQuizId: 1 }).lean()
  if (!rows.length) return

  const numbering = numberAttempts(rows, keyOf)

  // One lookup for every legacy test referenced, rather than one per attempt.
  const legacyIds = [...new Set(rows.map((row) => String(row[legacyIdField])).filter(Boolean))]
  const tests = await TestQuiz.find(
    { legacyKind, legacyId: { $in: legacyIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    { legacyId: 1 }
  ).lean()
  const testByLegacyId = new Map(tests.map((test) => [String(test.legacyId), test._id]))

  const attemptNoById = new Map(numbering.map((update) => [String(update._id), update.attemptNo]))
  const writes = []
  for (const row of rows) {
    const set = {}
    if (attemptNoById.has(String(row._id))) set.attemptNo = attemptNoById.get(String(row._id))
    const testQuizId = testByLegacyId.get(String(row[legacyIdField]))
    if (testQuizId && String(row.testQuizId ?? '') !== String(testQuizId)) set.testQuizId = testQuizId
    if (Object.keys(set).length) writes.push({ updateOne: { filter: { _id: row._id }, update: { $set: set } } })
  }

  counts[label] = writes.length
  const unmapped = rows.filter((row) => !testByLegacyId.has(String(row[legacyIdField]))).length
  if (unmapped) counts[`${label}Unmapped`] = unmapped

  if (writes.length && !dryRun) await Model.bulkWrite(writes, { ordered: false })
}

async function copySessions(counts) {
  const sessions = await AssessmentSession.find().lean()
  if (!sessions.length) return

  const assessmentIds = [...new Set(sessions.map((session) => String(session.assessmentId)))]
  const tests = await TestQuiz.find(
    { legacyKind: 'ASSESSMENT', legacyId: { $in: assessmentIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    { legacyId: 1 }
  ).lean()
  const testByLegacyId = new Map(tests.map((test) => [String(test.legacyId), test._id]))

  for (const session of sessions) {
    const quizId = testByLegacyId.get(String(session.assessmentId))
    if (!quizId) {
      counts.sessionsUnmapped += 1
      continue
    }
    counts.sessions += 1
    if (dryRun) continue
    await TestSession.updateOne(
      { legacyId: session._id },
      {
        $set: {
          userId: session.userId,
          quizId,
          courseId: session.courseId ?? null,
          startedAt: session.startedAt,
          // Carried over unchanged. Recomputing it from "now" would hand an
          // in-progress sitting a fresh timer, which is the one thing a
          // server-side deadline exists to prevent.
          expiresAt: session.expiresAt,
          focusLossCount: session.focusLossCount ?? 0,
          status: session.status,
          endedReason: session.endedReason ?? '',
          endedAt: session.endedAt ?? null,
          legacyId: session._id,
        },
      },
      { upsert: true }
    )
  }
}

export async function run() {
  const counts = { quizAttempts: 0, assessmentAttempts: 0, sessions: 0, sessionsUnmapped: 0 }

  await backfill(QuizAttempt, (row) => `${row.userId}:${row.quizId}`, 'QUIZ', 'quizId', counts, 'quizAttempts')
  await backfill(
    AssessmentAttempt,
    (row) => `${row.userId}:${row.assessmentId}`,
    'ASSESSMENT',
    'assessmentId',
    counts,
    'assessmentAttempts'
  )
  await copySessions(counts)

  return counts
}

async function main() {
  await connectDatabase()

  const counts = await run()
  console.log(`${counts.quizAttempts} video-quiz attempt(s) to update`)
  console.log(`${counts.assessmentAttempts} assessment attempt(s) to update`)
  console.log(`${counts.sessions} sitting(s) to carry across`)
  if (counts.quizAttemptsUnmapped) {
    console.log(`  ${counts.quizAttemptsUnmapped} attempt(s) whose quiz has no migrated test — run M1 first`)
  }
  if (counts.assessmentAttemptsUnmapped) {
    console.log(`  ${counts.assessmentAttemptsUnmapped} attempt(s) whose assessment has no migrated test — run M1 first`)
  }
  if (counts.sessionsUnmapped) console.log(`  ${counts.sessionsUnmapped} sitting(s) with no migrated test`)
  if (dryRun) console.log('\n--dry-run: nothing written')

  await mongoose.connection.close()
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('migrateAttempts.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
