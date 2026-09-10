// 14.5 — every migration script has a --dry-run, and it really is dry.
//
// A migration is the one kind of code that gets exactly one careful run on
// production, usually late, usually by somebody who wants to know what it is
// about to do before it does it. That promise is only worth something if it
// is checked: a `--dry-run` that quietly writes anyway is worse than none at
// all, because it is trusted.
//
// So each case here does the same three things:
//
//   1. seeds a document the migration *would* want to change,
//   2. runs the script as the operator does — a real child process, the real
//      flag, against the real database,
//   3. asserts the output names the pending change, and that the database is
//      byte-for-byte what it was: collection counts and the seeded document
//      itself, read raw.
//
// Point 1 matters: a script run against nothing to do writes nothing whether
// or not the flag works. The seed is what makes the assertion mean anything.
//
// `--dry-run` was added to two scripts for this (migrateLegacyChat.js and
// backfillEmployeeNames.js) — the flag is spelled and behaves the same way in
// all of them, and no-flag behaviour is untouched.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { Quiz } from '../src/models/quiz.model.js'
import { QuizAttempt } from '../src/models/quizAttempt.model.js'
import { AssessmentAttempt } from '../src/models/assessmentAttempt.model.js'
import { Assessment } from '../src/models/assessment.model.js'
import { TestQuiz } from '../src/models/testQuiz.model.js'
import { TestSession } from '../src/models/testSession.model.js'
import { Question } from '../src/models/question.model.js'
import { QuestionBank } from '../src/models/questionBank.model.js'
import { Event } from '../src/models/event.model.js'
import { EventRegistration } from '../src/models/eventRegistration.model.js'
import { Group } from '../src/models/group.model.js'
import { Badge } from '../src/models/badge.model.js'
import { UserBadge } from '../src/models/userBadge.model.js'
import { PointsLedger } from '../src/models/pointsLedger.model.js'
import { NotificationTemplate } from '../src/models/notificationTemplate.model.js'
import { Conversation } from '../src/models/conversation.model.js'
import { ChatMessage } from '../src/models/chatMessage.model.js'
import { hashPassword } from '../src/utils/hash.js'

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/scripts')
const backendDir = path.resolve(scriptsDir, '../..')

const stamp = String(Date.now()).slice(-9)
let seq = 0
let author
let tmpDir

const trash = []
/** Anything created by a seed goes here so the fixture leaves nothing behind. */
function cleanupLater(model, filter) {
  trash.push({ model, filter })
}

function runScript(file, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptsDir, file), ...args], {
      cwd: backendDir,
      env: process.env,
    })
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    // The older scripts report through the winston logger, which writes to
    // stderr; the newer ones console.log. Both are "what the operator sees".
    child.stderr.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, out }))
  })
}

/** Collection sizes, as the plainest possible "was anything written". */
async function counts(models) {
  const entries = await Promise.all(models.map(async (model) => [model.modelName, await model.countDocuments()]))
  return Object.fromEntries(entries)
}

/**
 * The seeded documents, read raw.
 *
 * Raw rather than through the model, because the fields a migration
 * backfills are exactly the ones a Mongoose read would helpfully invent a
 * default for — a document that is missing `level` and one that stores
 * `"BEGINNER"` look identical through the model, which is the difference
 * this test exists to see.
 */
async function rawDocs(refs) {
  const entries = await Promise.all(
    refs.map(async ([label, model, id]) => [label, await model.collection.findOne({ _id: id })])
  )
  return JSON.stringify(Object.fromEntries(entries))
}

async function makeUser(firstName, extra = {}) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')
  const user = await User.create({
    firstName,
    lastName: 'Migratsiya',
    fullName: `${firstName} Migratsiya`,
    jshshir: `66${stamp}${seq++}`,
    passwordHash: await hashPassword('MigrateTest123!'),
    roleId: role._id,
    department: `DryRun-${stamp}`,
    ...extra,
  })
  cleanupLater(User, { _id: user._id })
  return user
}

async function makeCourse() {
  const course = await Course.create({
    title: `Dry run ${stamp}-${seq}`,
    slug: `dry-run-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  cleanupLater(Course, { _id: course._id })
  return course
}

/**
 * The table. One row per `migrate:*` entry in backend/package.json, plus
 * backfillEmployeeNames (which is `migrate:names`).
 *
 * `seed` returns what the case has to watch: the models whose sizes must not
 * change, and the documents whose content must not change.
 */
const cases = [
  {
    name: 'migrate:course-metadata',
    file: 'migrateCourseMetadata.js',
    expect: [/level: \d+ course\(s\) missing it/, /--dry-run: nothing written/],
    async seed() {
      const course = await makeCourse()
      // Exactly the state the migration exists for: a course written before
      // the field existed, which Mongoose defaults never retroactively fill.
      await Course.collection.updateOne(
        { _id: course._id },
        { $unset: { level: '', navigationMode: '', completionRule: '' } }
      )
      return { models: [Course], docs: [['course', Course, course._id]] }
    },
  },
  {
    name: 'migrate:events',
    file: 'migrateEvents.js',
    expect: [/registration\(s\) to create from \d+ event\(s\)/, /--dry-run: nothing written/],
    async seed() {
      const attendee = await makeUser('Ishtirokchi')
      const event = await Event.create({
        title: `Dry run event ${stamp}`,
        type: 'MEETING',
        startAt: new Date('2026-09-20T09:00:00Z'),
        endAt: new Date('2026-09-20T10:00:00Z'),
        participants: [attendee._id],
        createdBy: author._id,
      })
      cleanupLater(Event, { _id: event._id })
      cleanupLater(EventRegistration, { eventId: event._id })
      await Event.collection.updateOne({ _id: event._id }, { $unset: { status: '', capacity: '' } })
      return { models: [Event, EventRegistration], docs: [['event', Event, event._id]] }
    },
  },
  {
    name: 'migrate:group-types',
    file: 'migrateGroupTypes.js',
    expect: [/group\(s\) total, [1-9]\d* without a type/, /--dry-run: nothing written/],
    async seed() {
      const group = await Group.create({ name: `Dry run group ${stamp}`, createdBy: author._id })
      cleanupLater(Group, { _id: group._id })
      await Group.collection.updateOne({ _id: group._id }, { $unset: { type: '' } })
      return { models: [Group], docs: [['group', Group, group._id]] }
    },
  },
  {
    name: 'migrate:prefs',
    file: 'migrateUserNotificationPrefs.js',
    expect: [/account\(s\): [1-9]\d* without locale/, /--dry-run: nothing written/],
    async seed() {
      const user = await makeUser('Sozlama')
      await User.collection.updateOne({ _id: user._id }, { $unset: { locale: '', notificationPrefs: '' } })
      return { models: [User], docs: [['user', User, user._id]] }
    },
  },
  {
    name: 'migrate:jshshir',
    file: 'migrateUsernameToJshshir.js',
    expect: [/would assign [1-9]\d* placeholder JSHSHIR/],
    async seed() {
      const user = await makeUser('Login')
      // A pre-JSHSHIR account: a username and no national id. Written raw
      // because the current schema would refuse it — which is the point.
      await User.collection.updateOne(
        { _id: user._id },
        { $unset: { jshshir: '' }, $set: { username: `legacy-${stamp}` } }
      )
      return { models: [User], docs: [['user', User, user._id]] }
    },
  },
  {
    name: 'migrate:templates',
    file: 'migrateNotificationTemplates.js',
    expect: [/row\(s\) for retired type\(s\)/, /--dry-run: nothing written/],
    async seed() {
      // A row for a type the seed no longer knows — what a rename leaves
      // behind. A real run deletes the unedited ones; a dry run must not.
      const sample = await NotificationTemplate.findOne().lean()
      assert.ok(sample, 'notification templates are missing — run migrate:templates once')
      const orphan = await NotificationTemplate.create({
        ...sample,
        _id: undefined,
        type: `RETIRED_DRY_RUN_${stamp}`,
        channel: sample.channel,
        lang: sample.lang,
        subject: 'Dry run orphan',
        customized: false,
      })
      cleanupLater(NotificationTemplate, { _id: orphan._id })
      return { models: [NotificationTemplate], docs: [['orphan', NotificationTemplate, orphan._id]] }
    },
  },
  {
    name: 'migrate:points-indexes',
    file: 'migratePointsIndexes.js',
    expect: [/index\(es\) on pointsLedgers, \d+ to replace/, /--dry-run: nothing written/],
    // This one rebuilds indexes rather than documents, so the thing that must
    // not change is the index list, and that is what `extra` compares.
    //
    // Nothing is seeded: planting the buggy sparse index would mean leaving a
    // shared collection holding the exact defect this script exists to remove
    // if the run died in between, and the ledger is live data. The honest
    // assertion available is that a dry run drops and creates nothing.
    async seed() {
      return {
        models: [PointsLedger],
        docs: [],
        extra: async () => JSON.stringify(await PointsLedger.collection.indexes()),
      }
    },
  },
  {
    name: 'migrate:quizzes',
    file: 'migrateQuizzes.js',
    expect: [/[1-9]\d* test\(s\) created/, /--dry-run: nothing written/],
    async seed() {
      const course = await makeCourse()
      const topic = await Topic.create({
        courseId: course._id,
        title: 'Mavzu',
        slug: `dry-run-topic-${stamp}-${seq++}`,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      cleanupLater(Topic, { _id: topic._id })
      const video = await Video.create({
        topicId: topic._id,
        courseId: course._id,
        title: 'Dars',
        duration: 60,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      cleanupLater(Video, { _id: video._id })
      const quiz = await Quiz.create({
        videoId: video._id,
        courseId: course._id,
        questions: [{ text: 'Savol?', order: 0, options: [{ text: 'Ha', isCorrect: true }, { text: "Yo'q" }] }],
        createdBy: author._id,
      })
      cleanupLater(Quiz, { _id: quiz._id })
      cleanupLater(TestQuiz, { legacyId: quiz._id })
      cleanupLater(QuestionBank, { courseId: course._id })
      return {
        models: [TestQuiz, Question, QuestionBank, Quiz, Assessment],
        docs: [['quiz', Quiz, quiz._id]],
      }
    },
  },
  {
    name: 'migrate:attempts',
    file: 'migrateAttempts.js',
    expect: [/[1-9]\d* video-quiz attempt\(s\) to update/, /--dry-run: nothing written/],
    async seed() {
      const course = await makeCourse()
      const learner = await makeUser('Urinish')
      const quizId = new mongoose.Types.ObjectId()
      // Two sittings at the same test by the same person: the second one has
      // to become attempt 2, and nothing recorded that before M5.
      const rows = await QuizAttempt.create([
        { userId: learner._id, quizId, courseId: course._id, scorePercent: 40 },
        { userId: learner._id, quizId, courseId: course._id, scorePercent: 80 },
      ])
      cleanupLater(QuizAttempt, { userId: learner._id })
      return {
        models: [QuizAttempt, AssessmentAttempt, TestSession],
        docs: rows.map((row, index) => [`attempt${index}`, QuizAttempt, row._id]),
      }
    },
  },
  {
    name: 'migrate:badges',
    file: 'migrateBadges.js',
    expect: [/[1-9]\d* award\(s\) across \d+ active user\(s\)/, /--dry-run: nothing written/],
    async seed() {
      const earner = await makeUser('Nishon')
      const course = await makeCourse()
      // 150 points clears the POINTS_100 threshold, so the backfill has a
      // badge to hand out — and must not hand it out.
      const ledger = await PointsLedger.create({
        userId: earner._id,
        videoId: new mongoose.Types.ObjectId(),
        courseId: course._id,
        points: 150,
        source: 'COMPLETION',
      })
      cleanupLater(PointsLedger, { _id: ledger._id })
      cleanupLater(UserBadge, { userId: earner._id })
      return { models: [Badge, UserBadge], docs: [] }
    },
  },
  {
    name: 'migrate:hierarchy',
    file: 'migrateUserHierarchy.js',
    args: () => ['--file', path.join(tmpDir, 'hierarchy.csv')],
    expect: [/[1-9]\d* account\(s\) to change/, /--dry-run: nothing written/],
    async seed() {
      const manager = await makeUser('Rahbar')
      const report = await makeUser('Xodim')
      await writeFile(
        path.join(tmpDir, 'hierarchy.csv'),
        `jshshir,managerJshshir\n${report.jshshir},${manager.jshshir}\n`,
        'utf8'
      )
      return { models: [User], docs: [['report', User, report._id]] }
    },
  },
  {
    name: 'migrate:chat',
    file: 'migrateLegacyChat.js',
    expect: [/would convert [1-9]\d* conversation/, /--dry-run: nothing written/],
    async seed() {
      const employee = await makeUser('Xabarchi')
      const staff = await makeUser('Operator')
      // The legacy shape: one support thread per employee, no participants
      // pair. Inserted raw — the current schema requires participantsKey,
      // and a document that satisfies it is not a document to migrate.
      const { insertedId } = await Conversation.collection.insertOne({
        employeeId: employee._id,
        employeeLastReadAt: null,
        staffLastReadAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      cleanupLater(Conversation, { _id: insertedId })
      const reply = await ChatMessage.create({
        conversationId: insertedId,
        senderId: staff._id,
        text: 'Assalomu alaykum',
      })
      cleanupLater(ChatMessage, { _id: reply._id })
      return {
        models: [Conversation, ChatMessage],
        docs: [
          ['conversation', Conversation, insertedId],
          ['reply', ChatMessage, reply._id],
        ],
        // The script also drops a stale index when it is not dry — dropping
        // an index is a write like any other.
        extra: async () => JSON.stringify((await Conversation.collection.indexes()).map((index) => index.name)),
      }
    },
  },
  {
    name: 'migrate:names',
    file: 'backfillEmployeeNames.js',
    expect: [/--dry-run.*nothing written|nothing written/],
    async seed() {
      const user = await makeUser('Ism')
      // Pre-split: one fullName, both halves empty.
      await User.collection.updateOne(
        { _id: user._id },
        { $set: { firstName: '', lastName: '', fullName: 'Abdullayev Azamjon' } }
      )
      return { models: [User], docs: [['user', User, user._id]] }
    },
  },
]

describe('14.5 · every migration has an honest --dry-run', () => {
  before(async () => {
    await connectDatabase()
    author = await makeUser('Muallif')
    tmpDir = path.join(os.tmpdir(), `qollanma-dryrun-${stamp}`)
    await mkdir(tmpDir, { recursive: true })
  })

  after(async () => {
    // Reverse order: a seed's dependants were pushed after it.
    for (const { model, filter } of trash.reverse()) {
      await model.deleteMany(filter)
    }
    await rm(tmpDir, { recursive: true, force: true })
    await mongoose.connection.close()
  })

  for (const migration of cases) {
    test(`${migration.name} · --dry-run reports and writes nothing`, async () => {
      const watched = await migration.seed()
      const before = {
        counts: await counts(watched.models),
        docs: await rawDocs(watched.docs),
        extra: watched.extra ? await watched.extra() : null,
      }

      const args = ['--dry-run', ...(migration.args ? migration.args() : [])]
      const { code, out } = await runScript(migration.file, args)
      assert.equal(code, 0, `${migration.file} exited ${code}:\n${out}`)

      // It has to say what it would do — a silent dry run is not a report.
      for (const pattern of migration.expect) {
        assert.match(out, pattern)
      }

      const after = {
        counts: await counts(watched.models),
        docs: await rawDocs(watched.docs),
        extra: watched.extra ? await watched.extra() : null,
      }
      assert.deepEqual(after.counts, before.counts, 'no document was created or removed')
      assert.equal(after.docs, before.docs, 'the seeded document(s) came back byte-for-byte')
      assert.equal(after.extra, before.extra, 'nothing else the script touches changed either')
    })
  }
})
