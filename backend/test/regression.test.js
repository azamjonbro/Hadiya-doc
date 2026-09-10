// 14.1 / AT-R1…AT-R12 — the regression fence.
//
// These are not features. Every one of them is a property the platform
// already has and that a refactor could silently take away: a percentage
// that cannot be dragged upward, a clock that cannot be reset by a reload,
// an answer key that never reaches the person being tested. Each test names
// its AT-R number so a failure says which promise broke.
//
// They run against the real Mongo on purpose. Half of these properties *are*
// a database constraint (the points ledger's partial unique index, the face
// embedding's `select: false`) — asserted against a mock they would prove
// only that the mock was written to agree.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { ATTENTION_EVENTS, PERMISSIONS } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { VideoProgress } from '../src/models/videoProgress.model.js'
import { VideoSession } from '../src/models/videoSession.model.js'
import { VideoAnalyticsEvent } from '../src/models/videoAnalyticsEvent.model.js'
import { Quiz } from '../src/models/quiz.model.js'
import { Material } from '../src/models/material.model.js'
import { MaterialProgress } from '../src/models/materialProgress.model.js'
import { Assessment } from '../src/models/assessment.model.js'
import { AssessmentAttempt } from '../src/models/assessmentAttempt.model.js'
import { AssessmentSession } from '../src/models/assessmentSession.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { PointsLedger } from '../src/models/pointsLedger.model.js'
import { FaceProfile } from '../src/models/faceProfile.model.js'
import { AttentionPolicy } from '../src/models/attentionPolicy.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { processVideoEvents } from '../src/analytics/videoEventProcessor.js'
import { assertVideoUnlocked } from '../src/services/courses/courseSequence.js'
import { assessmentService, ASSESSMENT_FOCUS_LOSS_LIMIT } from '../src/services/assessments/assessment.service.js'
import { quizService } from '../src/services/quizzes/quiz.service.js'
import { materialProgressService } from '../src/services/materials/materialProgress.service.js'
import { courseAssignmentService } from '../src/services/courses/courseAssignment.service.js'
import { attentionPolicyService } from '../src/services/courses/attentionPolicy.service.js'
import { pointsService } from '../src/services/gamification/points.service.js'
import { faceProfileRepository } from '../src/repositories/faceProfile.repository.js'
import { faceVerificationService } from '../src/services/face/faceVerification.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0

let learner
let author
let learnerActor
let authorActor

const courseIds = []
const userIds = []

async function makeUser(firstName) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')
  const user = await User.create({
    firstName,
    lastName: 'Regress',
    fullName: `${firstName} Regress`,
    jshshir: `77${stamp}${userIds.length}`,
    passwordHash: await hashPassword('RegressTest123!'),
    roleId: role._id,
    department: `Regression-${stamp}`,
  })
  userIds.push(user._id)
  return user
}

async function makeCourse(label) {
  const course = await Course.create({
    title: `Regression ${label} ${stamp}`,
    slug: `regression-${label}-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  courseIds.push(course._id)
  return course
}

async function makeTopic(course) {
  return Topic.create({
    courseId: course._id,
    title: 'Mavzu',
    slug: `regression-topic-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    order: 1,
    createdBy: author._id,
  })
}

async function makeVideo(course, topic, extra = {}) {
  return Video.create({
    topicId: topic._id,
    courseId: course._id,
    title: `Dars ${seq}`,
    duration: 600,
    status: 'PUBLISHED',
    order: seq++,
    createdBy: author._id,
    ...extra,
  })
}

/** One ingest call, as the player makes it. */
function ingest(video, events, sessionSuffix) {
  return processVideoEvents({
    userId: learner._id.toString(),
    sessionId: `regression-${stamp}-${sessionSuffix}`,
    videoId: video._id.toString(),
    events,
    device: 'desktop',
    browser: 'chrome',
  })
}

const at = (offsetSeconds) => new Date(Date.UTC(2026, 8, 10, 8, 0, offsetSeconds)).toISOString()

describe('14.1 · regression fence (AT-R1…AT-R12)', () => {
  before(async () => {
    await connectDatabase()
    author = await makeUser('Muallif')
    learner = await makeUser('Oquvchi')
    learnerActor = { id: learner._id.toString(), permissions: [] }
    authorActor = { id: author._id.toString(), permissions: [PERMISSIONS.COURSE_CREATE] }
  })

  after(async () => {
    await Promise.all([
      VideoProgress.deleteMany({ userId: { $in: userIds } }),
      VideoSession.deleteMany({ userId: { $in: userIds } }),
      VideoAnalyticsEvent.deleteMany({ userId: { $in: userIds } }),
      MaterialProgress.deleteMany({ userId: { $in: userIds } }),
      AssessmentAttempt.deleteMany({ userId: { $in: userIds } }),
      AssessmentSession.deleteMany({ userId: { $in: userIds } }),
      CourseAssignment.deleteMany({ courseId: { $in: courseIds } }),
      PointsLedger.deleteMany({ userId: { $in: userIds } }),
      FaceProfile.deleteMany({ userId: { $in: userIds } }),
      AuditLog.deleteMany({ actor: { $in: userIds.map(String) } }),
    ])
    await Promise.all([
      Quiz.deleteMany({ courseId: { $in: courseIds } }),
      Material.deleteMany({ courseId: { $in: courseIds } }),
      Assessment.deleteMany({ courseId: { $in: courseIds } }),
      Video.deleteMany({ courseId: { $in: courseIds } }),
      Topic.deleteMany({ courseId: { $in: courseIds } }),
      AttentionPolicy.deleteMany({ courseId: { $in: courseIds } }),
    ])
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  // ---------------------------------------------------------------- AT-R1
  test('AT-R1 · dragging the video to the end does not raise completionPercent', async () => {
    const course = await makeCourse('r1')
    const topic = await makeTopic(course)
    const video = await makeVideo(course, topic)

    // Ten seconds actually played, then the scrub bar dragged to 09:50, then
    // five more seconds played there. A client that reported "percent" would
    // now say 99%; the server only ever adds up intervals it was told played.
    const result = await ingest(
      video,
      [
        { eventType: 'play', timestamp: at(0), position: 0 },
        { eventType: 'progress', timestamp: at(10), position: 0, duration: 10 },
        { eventType: 'seek', timestamp: at(11), position: 590, metadata: { from: 10, to: 590 } },
        { eventType: 'progress', timestamp: at(16), position: 590, duration: 5 },
      ],
      'r1'
    )

    assert.equal(result.uniqueWatchedSeconds, 15)
    assert.equal(result.completionPercent, 2.5)
    assert.equal(result.completed, false)

    // The seek was recorded — it is not that the event was dropped, it is
    // that a jump contributes no watched interval.
    const progress = await VideoProgress.findOne({ userId: learner._id, videoId: video._id })
    assert.equal(progress.forwardSeekSeconds, 580)
    assert.equal(progress.watchedSegments.length, 2, 'the jump leaves a hole, not one long segment')
    assert.deepEqual(
      progress.watchedSegments.map((s) => [s.start, s.end]),
      [
        [0, 10],
        [590, 595],
      ]
    )
  })

  // ---------------------------------------------------------------- AT-R2
  describe('AT-R2 · inattention is subtracted when requireRewatch is on', () => {
    // Five minutes played, with 100s–200s of it spent looking away. The
    // seconds arrived as ordinary `progress` events in the same batch, so
    // the only thing that can remove them is subtractSegments.
    const watchedWithInattention = [
      { eventType: 'play', timestamp: at(0), position: 0 },
      { eventType: 'progress', timestamp: at(300), position: 0, duration: 300 },
      { eventType: ATTENTION_EVENTS.LOST, timestamp: at(120), position: 100 },
      {
        eventType: ATTENTION_EVENTS.REGAINED,
        timestamp: at(220),
        position: 200,
        duration: 100,
        metadata: { fromPosition: 100, toPosition: 200 },
      },
    ]

    test('the inattentive range is cut back out of the watched segments', async () => {
      const course = await makeCourse('r2-on')
      const topic = await makeTopic(course)
      const video = await makeVideo(course, topic)

      // requireRewatch defaults to true (packages/shared/src/attention.js).
      const policy = await attentionPolicyService.getEffectiveForCourse(course._id.toString())
      assert.equal(policy.requireRewatch, true)

      const result = await ingest(video, watchedWithInattention, 'r2-on')
      assert.equal(result.uniqueWatchedSeconds, 200, '300 played, 100 looked away')

      const progress = await VideoProgress.findOne({ userId: learner._id, videoId: video._id })
      assert.deepEqual(
        progress.watchedSegments.map((s) => [s.start, s.end]),
        [
          [0, 100],
          [200, 300],
        ]
      )
      // The wall-clock number is kept whole — only the progress is docked.
      assert.equal(progress.inattentiveSeconds, 100)
    })

    test('with requireRewatch off the same batch keeps all 300 seconds', async () => {
      const course = await makeCourse('r2-off')
      const topic = await makeTopic(course)
      const video = await makeVideo(course, topic)
      await attentionPolicyService.updateForCourse(authorActor, course._id.toString(), { requireRewatch: false })

      const result = await ingest(video, watchedWithInattention, 'r2-off')
      assert.equal(result.uniqueWatchedSeconds, 300, 'the policy, not the event shape, is what subtracts')
    })
  })

  // ------------------------------------------------------------ AT-R3…R5
  describe('AT-R3…AT-R5 · the sitting', () => {
    let course
    let topic

    async function makeAssessment() {
      return Assessment.create({
        topicId: topic._id,
        courseId: course._id,
        title: `Test ${seq++}`,
        status: 'PUBLISHED',
        passScorePercent: 70,
        questions: [
          {
            text: 'Ikki karra ikki?',
            order: 0,
            options: [{ text: '4', isCorrect: true }, { text: '5' }],
          },
        ],
        createdBy: author._id,
      })
    }

    before(async () => {
      course = await makeCourse('exam')
      topic = await makeTopic(course)
      // start() refuses an unassigned learner before it ever looks at a
      // session, so the assignment is part of the fixture, not the test.
      await CourseAssignment.create({ userId: learner._id, courseId: course._id, assignedBy: author._id })
    })

    test('AT-R3 · reloading the page does not hand out a fresh 15 minutes', async () => {
      const assessment = await makeAssessment()

      const first = await assessmentService.start(learnerActor, assessment._id.toString())
      const reloaded = await assessmentService.start(learnerActor, assessment._id.toString())

      assert.equal(reloaded.session.id, first.session.id, 'the same sitting is resumed')
      assert.equal(
        new Date(reloaded.session.expiresAt).getTime(),
        new Date(first.session.expiresAt).getTime(),
        'expiresAt is stamped once, at the start'
      )
      assert.equal(await AssessmentSession.countDocuments({ userId: learner._id, assessmentId: assessment._id }), 1)

      // And the briefing endpoint hands the client that same deadline, which
      // is what makes a reload resume rather than restart.
      const briefing = await assessmentService.getById(learnerActor, assessment._id.toString())
      assert.equal(new Date(briefing.activeSession.expiresAt).getTime(), new Date(first.session.expiresAt).getTime())
    })

    test('AT-R4 · walking away from a sitting records a zero-score attempt', async () => {
      const assessment = await makeAssessment()
      const opened = await assessmentService.start(learnerActor, assessment._id.toString())
      assert.equal(await AssessmentAttempt.countDocuments({ userId: learner._id, assessmentId: assessment._id }), 0)

      // The clock ran out while nobody was looking. Nothing in the product
      // polls for this: the expired sitting is closed the next time the
      // learner turns up, which is what closeExpiredSession is for.
      await AssessmentSession.updateOne({ _id: opened.session.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })

      const reopened = await assessmentService.start(learnerActor, assessment._id.toString())
      assert.notEqual(reopened.session.id, opened.session.id, 'the abandoned sitting is over, not resumed')

      const closed = await AssessmentSession.findById(opened.session.id)
      assert.equal(closed.status, 'TERMINATED')
      assert.equal(closed.endedReason, 'TIME_EXPIRED')

      const attempts = await AssessmentAttempt.find({ userId: learner._id, assessmentId: assessment._id })
      assert.equal(attempts.length, 1, 'abandoning costs an attempt')
      assert.equal(attempts[0].scorePercent, 0)
      assert.equal(attempts[0].passed, false)
    })

    test('AT-R5 · the second focus loss ends the sitting and grades what was filled in', async () => {
      const assessment = await makeAssessment()
      await assessmentService.start(learnerActor, assessment._id.toString())
      const questionId = assessment.questions[0]._id.toString()
      const answers = [{ questionId, selectedOptionIndex: 0 }]

      const warning = await assessmentService.reportFocusLoss(learnerActor, assessment._id.toString(), answers)
      assert.equal(warning.terminated, false, 'the first one is a warning')
      assert.equal(warning.focusLossCount, 1)
      assert.equal(warning.result, null)

      const terminated = await assessmentService.reportFocusLoss(learnerActor, assessment._id.toString(), answers)
      assert.equal(terminated.terminated, true)
      assert.equal(terminated.focusLossCount, ASSESSMENT_FOCUS_LOSS_LIMIT)
      // Graded, not discarded — the browser may never come back to submit.
      assert.equal(terminated.result.scorePercent, 100)
      assert.equal(terminated.result.endedReason, 'FOCUS_LOST')

      const session = await AssessmentSession.findOne({ userId: learner._id, assessmentId: assessment._id })
      assert.equal(session.status, 'TERMINATED')
      assert.equal(session.endedReason, 'FOCUS_LOST')
      assert.equal(await AssessmentAttempt.countDocuments({ userId: learner._id, assessmentId: assessment._id }), 1)
    })

    // ------------------------------------------------------------- AT-R8
    test('AT-R8 · the questions are not handed out before start()', async () => {
      const assessment = await makeAssessment()
      const briefing = await assessmentService.getById(learnerActor, assessment._id.toString())

      assert.equal(briefing.questions, undefined, 'a learner gets the briefing, not the paper')
      assert.equal(briefing.questionCount, 1, 'how many, but not which')
      assert.ok(!JSON.stringify(briefing).includes('Ikki karra ikki'), 'no question text leaks through the briefing')

      // The same call for an author is the admin editor's load, answers and
      // all — so the branch, not an empty assessment, is what is being tested.
      const editorView = await assessmentService.getById(authorActor, assessment._id.toString())
      assert.equal(editorView.questions.length, 1)
      assert.equal(editorView.questions[0].options[0].isCorrect, true)

      // And the topic listing is a summary for the same reason.
      const listed = await assessmentService.listByTopic(learnerActor, topic._id.toString())
      assert.ok(!JSON.stringify(listed).includes('Ikki karra ikki'))

      // start() is the one door the questions come through.
      const started = await assessmentService.start(learnerActor, assessment._id.toString())
      assert.equal(started.assessment.questions[0].text, 'Ikki karra ikki?')
    })
  })

  // ---------------------------------------------------------------- AT-R6
  test('AT-R6 · no playback token for lesson 2 until lesson 1 is finished', async () => {
    const course = await makeCourse('sequence')
    const topic = await makeTopic(course)
    const first = await makeVideo(course, topic, { title: 'Birinchi dars', order: 1 })
    const second = await makeVideo(course, topic, { title: 'Ikkinchi dars', order: 2 })

    await assert.rejects(
      () => assertVideoUnlocked(learnerActor, second),
      (error) => {
        assert.equal(error.code, 'PREVIOUS_VIDEO_INCOMPLETE')
        assert.equal(error.statusCode, 403)
        return true
      }
    )
    // The first lesson itself is never locked, or the course could not start.
    await assertVideoUnlocked(learnerActor, first)

    // Staff review any lesson without sitting the course first.
    await assertVideoUnlocked(authorActor, second)

    // Finishing lesson 1 opens lesson 2 — the lock is derived from progress,
    // not from a flag somebody has to remember to flip.
    await VideoProgress.create({
      userId: learner._id,
      videoId: first._id,
      courseId: course._id,
      completedAt: new Date(),
      completionPercent: 100,
    })
    await assertVideoUnlocked(learnerActor, second)
  })

  // ---------------------------------------------------------------- AT-R7
  test('AT-R7 · a learner is never sent isCorrect', async () => {
    const course = await makeCourse('quiz')
    const topic = await makeTopic(course)
    const video = await makeVideo(course, topic, { hasQuiz: true })
    await Quiz.create({
      videoId: video._id,
      courseId: course._id,
      questions: [
        {
          text: 'Qaysi javob to‘g‘ri?',
          order: 0,
          options: [{ text: 'To‘g‘risi', isCorrect: true }, { text: 'Noto‘g‘risi' }],
        },
      ],
      createdBy: author._id,
    })

    const learnerView = await quizService.getForVideo(learnerActor, video._id.toString())
    assert.equal(learnerView.questions.length, 1, 'the questions still arrive — it is the key that does not')
    assert.ok(!JSON.stringify(learnerView).includes('isCorrect'))
    for (const option of learnerView.questions[0].options) {
      assert.ok(!('isCorrect' in option))
    }

    // The editor's view of the same quiz proves the flag is stored and that
    // the learner's copy was stripped rather than never written. Note the
    // permission: quiz.service.js gates the answer key on VIDEO_MANAGE,
    // while the rest of the course domain uses canManageCourses /
    // COURSE_CREATE. Both are held by the same admin roles, so this is not a
    // hole — but the test asks for the permission the code actually reads.
    const editorActor = { id: author._id.toString(), permissions: [PERMISSIONS.VIDEO_MANAGE] }
    const authorView = await quizService.getForVideo(editorActor, video._id.toString())
    assert.equal(authorView.questions[0].options[0].isCorrect, true)
  })

  // ---------------------------------------------------------------- AT-R9
  test('AT-R9 · one video pays points once, and never blocks the next video', async () => {
    const course = await makeCourse('points')
    const topic = await makeTopic(course)
    const video = await makeVideo(course, topic, { pointsEnabled: true, points: 10 })
    const otherVideo = await makeVideo(course, topic, { pointsEnabled: true, points: 10 })

    const first = await pointsService.award(learner._id, video._id, course._id, 10, 'COMPLETION')
    const again = await pointsService.award(learner._id, video._id, course._id, 10, 'COMPLETION')

    assert.equal(first.awarded, true)
    assert.equal(again.awarded, false, 'a re-watch is not a second payout')
    assert.equal(await PointsLedger.countDocuments({ userId: learner._id, videoId: video._id }), 1)

    // The regression the partial index exists for: a *second* video used to
    // collide with the first on {userId, assessmentId: null}, so everybody
    // was paid for exactly one video ever, silently.
    const other = await pointsService.award(learner._id, otherVideo._id, course._id, 10, 'COMPLETION')
    assert.equal(other.awarded, true, 'a different video is a different payout')
    assert.equal(await PointsLedger.countDocuments({ userId: learner._id, courseId: course._id }), 2)
  })

  // --------------------------------------------------------------- AT-R10
  test('AT-R10 · jumping to page 40 of 100 is 1%, not 40%', async () => {
    const course = await makeCourse('material')
    const topic = await makeTopic(course)
    const material = await Material.create({
      topicId: topic._id,
      courseId: course._id,
      type: 'PRESENTATION',
      title: 'Taqdimot',
      key: `regression/${stamp}/deck.pptx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      createdBy: author._id,
    })

    const jumped = await materialProgressService.recordPage(learnerActor, material._id.toString(), {
      page: 40,
      totalPages: 100,
    })
    assert.equal(jumped.viewedPages, 1, 'one page was seen, whatever its number')
    assert.equal(jumped.completionPercent, 1)
    assert.equal(jumped.completed, false)

    // The set is a set: the same page again moves nothing.
    const repeat = await materialProgressService.recordPage(learnerActor, material._id.toString(), {
      page: 40,
      totalPages: 100,
    })
    assert.equal(repeat.viewedPages, 1)
    assert.equal(repeat.completionPercent, 1)

    // A different page does move it, by exactly one page's worth.
    const next = await materialProgressService.recordPage(learnerActor, material._id.toString(), {
      page: 41,
      totalPages: 100,
    })
    assert.equal(next.viewedPages, 2)
    assert.equal(next.completionPercent, 2)

    const row = await MaterialProgress.findOne({ userId: learner._id, materialId: material._id })
    assert.deepEqual(row.viewedPages, [40, 41], 'stored as the pages seen, not a high-water mark')
  })

  // --------------------------------------------------------------- AT-R11
  test('AT-R11 · the face embedding is in no response', async () => {
    const embedding = Array.from({ length: 8 }, (_, i) => i / 10)
    await FaceProfile.create({
      userId: learner._id,
      enrolled: true,
      embedding,
      modelVersion: 'test-1',
      enrolledAt: new Date(),
    })

    // The ordinary read — the one every non-comparison call site uses.
    const profile = await faceProfileRepository.findByUserId(learner._id)
    assert.ok(profile, 'the row exists')
    assert.equal(profile.embedding, undefined)
    assert.ok(!('embedding' in profile.toObject()))
    assert.ok(!JSON.stringify(profile).includes('embedding'))

    // The client-facing shape.
    const status = await faceVerificationService.status(learner._id.toString())
    assert.equal(status.enrolled, true)
    assert.ok(!JSON.stringify(status).includes('embedding'))

    // Model-level, in case a future call site reaches past the repository.
    const direct = await FaceProfile.findOne({ userId: learner._id }).lean()
    assert.equal(direct.embedding, undefined)

    // And the one method allowed to see it still can — so the assertions
    // above are `select: false` working, not an embedding that was never
    // stored.
    const forComparison = await faceProfileRepository.findByUserIdWithEmbedding(learner._id)
    assert.deepEqual(forComparison.embedding, embedding)
  })

  // --------------------------------------------------------------- AT-R12
  test('AT-R12 · an assignment whose course is in the trash is not listed', async () => {
    const live = await makeCourse('live')
    const trashed = await makeCourse('trashed')
    await CourseAssignment.create({ userId: learner._id, courseId: live._id, assignedBy: author._id })
    await CourseAssignment.create({ userId: learner._id, courseId: trashed._id, assignedBy: author._id })

    const before = await courseAssignmentService.listForUser(learnerActor, learner._id.toString())
    assert.ok(before.some((row) => row.courseId === trashed._id.toString()), 'both are listed while both are live')

    await Course.updateOne({ _id: trashed._id }, { $set: { deletedAt: new Date(), deletedBy: author._id } })

    const after = await courseAssignmentService.listForUser(learnerActor, learner._id.toString())
    assert.ok(after.some((row) => row.courseId === live._id.toString()), 'the live course is still there')
    assert.ok(
      !after.some((row) => row.courseId === trashed._id.toString()),
      'a course the reader would get a 404 for is not offered in their list'
    )

    // The row itself survives: restoring the course brings the assignment
    // back with its deadline intact, which is the whole reason it is a
    // filter and not a delete.
    assert.ok(await CourseAssignment.findOne({ userId: learner._id, courseId: trashed._id }))
    await Course.updateOne({ _id: trashed._id }, { $set: { deletedAt: null, deletedBy: null } })
    const restored = await courseAssignmentService.listForUser(learnerActor, learner._id.toString())
    assert.ok(restored.some((row) => row.courseId === trashed._id.toString()))
  })
})
