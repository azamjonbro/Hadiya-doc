// 14.3 — AT-01 … AT-04, sealed at the edges the learner and the manager
// actually see.
//
// `courseCompletion.test.js` already pins the completion *service*: the rule,
// the transition, the notification. This file deliberately does not repeat
// that. It asserts the four acceptance tests through the surfaces their text
// names, which are the surfaces where the old split brain was visible:
//
//   AT-01  `GET /courses/:id/progress` reads 100, the assignment is
//          COMPLETED, and `employee-progress` counts the course as done —
//          the report is where a completion that never happened is most
//          expensive, because somebody signs off compliance from it.
//   AT-02  a failed mandatory test leaves it ACTIVE *and issues no
//          certificate* — the half of AT-02 the service test does not check,
//          and the half that would be handed to a regulator.
//   AT-03  the two endpoints in the text — the progress one and the user's
//          course list — compared against each other, for every course this
//          learner has.
//   AT-04  a reopened course does not revoke the certificate that was
//          already earned. The AT is explicit that it must not, and nothing
//          else in the suite says so.
//
// Everything runs against the real services and a real database. Nothing
// here asserts a value it computed itself.

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { VideoProgress } from '../src/models/videoProgress.model.js'
import { Material } from '../src/models/material.model.js'
import { MaterialProgress } from '../src/models/materialProgress.model.js'
import { Assessment } from '../src/models/assessment.model.js'
import { AssessmentAttempt } from '../src/models/assessmentAttempt.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { Certificate } from '../src/models/certificate.model.js'
import { Notification } from '../src/models/notification.model.js'
import { MailLog } from '../src/models/mailLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { courseCompletionService } from '../src/services/courses/courseCompletion.service.js'
import { courseService } from '../src/services/courses/course.service.js'
import { courseAssignmentService } from '../src/services/courses/courseAssignment.service.js'
import { reportDataService } from '../src/services/reports/reportData.service.js'
import { certificateQueue } from '../src/jobs/certificateQueue.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0

let learner
let admin
let learnerActor
let adminActor
const courseIds = []
const queuedJobIds = []
const made = {}

async function makeCourse(label, rule) {
  const course = await Course.create({
    title: `AT completion ${stamp}-${seq}`,
    description: 'x',
    slug: `at-completion-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: admin._id,
    ...(rule ? { completionRule: rule } : {}),
  })
  courseIds.push(course._id)
  const topic = await Topic.create({
    courseId: course._id,
    title: 'T',
    slug: `at-t-${stamp}-${seq++}`,
    order: 1,
    status: 'PUBLISHED',
    createdBy: admin._id,
  })
  await CourseAssignment.create({ userId: learner._id, courseId: course._id, assignedBy: admin._id })
  made[label] = { course, topic }
  return made[label]
}

const addVideo = (course, topic, extra = {}) =>
  Video.create({
    courseId: course._id,
    topicId: topic._id,
    title: 'V',
    order: 1,
    status: 'PUBLISHED',
    createdBy: admin._id,
    ...extra,
  })

const watch = (course, video) =>
  VideoProgress.create({
    userId: learner._id,
    courseId: course._id,
    videoId: video._id,
    completionPercent: 100,
    completedAt: new Date(),
  })

const addPresentation = (course, topic) =>
  Material.create({
    courseId: course._id,
    topicId: topic._id,
    type: 'PRESENTATION',
    title: 'Taqdimot',
    key: `at-k-${stamp}-${seq++}`,
    mimeType: 'application/pdf',
    status: 'PUBLISHED',
    createdBy: admin._id,
  })

const addAssessment = (course, topic) =>
  Assessment.create({
    courseId: course._id,
    topicId: topic._id,
    title: 'Yakuniy test',
    status: 'PUBLISHED',
    passScorePercent: 60,
    questions: [{ text: 'q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }],
    createdBy: admin._id,
  })

const attempt = (course, assessment, passed) =>
  AssessmentAttempt.create({
    userId: learner._id,
    assessmentId: assessment._id,
    courseId: course._id,
    answers: [],
    scorePercent: passed ? 100 : 20,
    passed,
  })

const statusOf = async (course) =>
  (await CourseAssignment.findOne({ userId: learner._id, courseId: course._id }).lean()).status

/** The job id queueCertificate would use, so a test can ask whether it exists. */
function certificateJobId(course) {
  const id = `course:${course._id}:${learner._id}`
  if (!queuedJobIds.includes(id)) queuedJobIds.push(id)
  return id
}

/** The learner's row in the real employee-progress report. */
async function progressReportRow() {
  const report = await reportDataService.build(adminActor, 'employee-progress', {
    userId: learner._id.toString(),
  })
  assert.equal(report.rows.length, 1, 'the report should hold exactly this learner')
  return report.rows[0]
}

describe('course completion · AT-01 … AT-04 (14.3)', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    const adminRole = await Role.findOne({ name: 'ADMIN' })
    assert.ok(employeeRole && adminRole, 'roles are missing — boot the server against this database once')

    learner = await User.create({
      firstName: 'Tugatuvchi',
      lastName: 'Xodim',
      fullName: 'Tugatuvchi Xodim',
      jshshir: `42${stamp}0`,
      passwordHash: await hashPassword('CompletionTest123!'),
      roleId: employeeRole._id,
      department: `Completion-${stamp}`,
    })
    admin = await User.create({
      firstName: 'Boshqaruvchi',
      lastName: 'Admin',
      fullName: 'Boshqaruvchi Admin',
      jshshir: `42${stamp}1`,
      passwordHash: await hashPassword('CompletionTest123!'),
      roleId: adminRole._id,
    })

    learnerActor = { id: learner._id.toString(), roleName: 'EMPLOYEE', permissions: [], scope: 'SELF' }
    adminActor = { id: admin._id.toString(), roleName: 'ADMIN', permissions: adminRole.permissions, scope: 'ALL' }
  })

  after(async () => {
    for (const jobId of queuedJobIds) await certificateQueue.remove(jobId).catch(() => {})
    await Certificate.deleteMany({ userId: learner._id })
    await Notification.deleteMany({ userId: learner._id })
    await MailLog.deleteMany({ userId: learner._id })
    await CourseAssignment.deleteMany({ userId: learner._id })
    await VideoProgress.deleteMany({ userId: learner._id })
    await MaterialProgress.deleteMany({ userId: learner._id })
    await AssessmentAttempt.deleteMany({ userId: learner._id })
    await Video.deleteMany({ courseId: { $in: courseIds } })
    await Material.deleteMany({ courseId: { $in: courseIds } })
    await Assessment.deleteMany({ courseId: { $in: courseIds } })
    await Topic.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: [learner._id, admin._id] } })
    await certificateQueue.close()
    await deliveryQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  beforeEach(async () => {
    await Notification.deleteMany({ userId: learner._id })
  })

  describe('AT-01 · a course with no video at all finishes', () => {
    // BERILGAN: one published presentation of ten pages and one published
    // assessment. No video. HARAKAT: the learner reads all ten pages and
    // passes the test.
    let course
    let topic
    let completedBefore

    test('AT-01 · the learner reads every page and passes the test', async () => {
      ;({ course, topic } = await makeCourse('noVideo'))
      const material = await addPresentation(course, topic)
      const assessment = await addAssessment(course, topic)

      completedBefore = (await progressReportRow()).completedCourses

      await MaterialProgress.create({
        userId: learner._id,
        courseId: course._id,
        topicId: topic._id,
        materialId: material._id,
        totalPages: 10,
        viewedPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        completionPercent: 100,
        completedAt: new Date(),
      })
      await attempt(course, assessment, true)

      const result = await courseCompletionService.evaluate(learner._id, course._id)
      assert.equal(result.complete, true)

      // Asserted here rather than in a test of its own: `beforeEach` clears
      // this learner's notifications, so a separate test would be reading an
      // empty collection and passing for the wrong reason.
      const told = await Notification.find({ userId: learner._id, type: 'COURSE_COMPLETED' }).lean()
      assert.equal(told.length, 1, 'the learner was not told their course finished')
    })

    test('AT-01 · GET /courses/:id/progress reads 100', async () => {
      // Through the service the endpoint calls, not through the completion
      // service — the whole point of AT-01 is that these agree, and reading
      // the same function twice would prove nothing.
      const progress = await courseService.getMyProgress(learnerActor, course._id.toString())
      assert.equal(progress.completionPercent, 100)
      assert.equal(progress.totalVideos, 0, 'the case is a course with no video at all')
      assert.equal(progress.totalItems, 2)
    })

    test('AT-01 · the assignment is COMPLETED', async () => {
      assert.equal(await statusOf(course), 'COMPLETED')
    })

    test('AT-01 · the certificate is queued for issue', async () => {
      // The certificate itself is the worker's job; what the completion
      // owes is the request for one, keyed so a second evaluation does not
      // ask twice.
      const job = await certificateQueue.getJob(certificateJobId(course))
      assert.ok(job, 'finishing a course must ask for the certificate')
      assert.equal(job.data.userId, learner._id.toString())
    })

    test('AT-01 · employee-progress counts one more completed course', async () => {
      // The report is a separate aggregation over CourseAssignment. If the
      // status had not really moved, the number here would not move either.
      const row = await progressReportRow()
      assert.equal(row.completedCourses, completedBefore + 1)
      assert.equal(row.fullName, learner.fullName)
    })
  })

  describe('AT-02 · a failed mandatory test blocks completion', () => {
    // BERILGAN: two videos and one mandatory assessment, requireAllRequired.
    // HARAKAT: both videos finished, the assessment failed.
    let course
    let topic

    test('AT-02 · both videos done, the test failed — the assignment stays ACTIVE', async () => {
      ;({ course, topic } = await makeCourse('failedTest', { minPercent: 100, requireAllRequired: true }))
      const first = await addVideo(course, topic)
      const second = await addVideo(course, topic, { title: 'V2', order: 2 })
      const assessment = await addAssessment(course, topic)
      await watch(course, first)
      await watch(course, second)
      await attempt(course, assessment, false)

      const result = await courseCompletionService.evaluate(learner._id, course._id)
      assert.equal(result.complete, false)
      assert.equal(await statusOf(course), 'ACTIVE')
    })

    test('AT-02 · completionPercent is under 100', async () => {
      const progress = await courseService.getMyProgress(learnerActor, course._id.toString())
      assert.ok(progress.completionPercent < 100, `expected under 100, got ${progress.completionPercent}`)
      // Two of three items done, so the number is real rather than zeroed:
      // the learner has done work and the page must show it.
      assert.equal(progress.completedItems, 2)
      assert.equal(progress.totalItems, 3)
    })

    test('AT-02 · no certificate is issued and none is even asked for', async () => {
      // The expensive half of AT-02. A certificate for a failed safety test
      // is the document somebody shows an inspector.
      const issued = await Certificate.countDocuments({ userId: learner._id, sourceId: course._id })
      assert.equal(issued, 0)
      const job = await certificateQueue.getJob(certificateJobId(course))
      assert.equal(job, undefined, 'a failed mandatory test must not queue a certificate')
    })

    test('AT-02 · passing the test later does finish it', async () => {
      const assessment = await Assessment.findOne({ courseId: course._id })
      await attempt(course, assessment, true)
      const result = await courseCompletionService.evaluate(learner._id, course._id)
      assert.equal(result.complete, true)
      assert.equal(await statusOf(course), 'COMPLETED')
    })
  })

  describe('AT-03 · progress and status never disagree', () => {
    test('AT-03 · 100% ⟺ COMPLETED, across every course this learner has', async () => {
      // The two calls the acceptance test names, one after the other, for
      // every course — which is the property, not one example of it.
      const assignments = await courseAssignmentService.listForUser(learnerActor, learner._id.toString())
      assert.ok(assignments.length >= 2, 'nothing to compare')

      for (const assignment of assignments) {
        const progress = await courseService.getMyProgress(learnerActor, String(assignment.courseId))
        assert.equal(
          progress.completionPercent === 100,
          assignment.status === 'COMPLETED',
          `course ${assignment.courseId}: ${progress.completionPercent}% but status ${assignment.status}`
        )
      }
    })

    test('AT-03 · an untouched course is 0% and ACTIVE, not 100% of nothing', async () => {
      // The other end of the same property. An empty percentage over an
      // empty course is the arithmetic that used to hand out completions.
      const { course, topic } = await makeCourse('untouched')
      await addVideo(course, topic)
      const progress = await courseService.getMyProgress(learnerActor, course._id.toString())
      assert.equal(progress.completionPercent, 0)
      assert.equal(await statusOf(course), 'ACTIVE')
    })
  })

  describe('AT-04 · a new required video reopens a finished course', () => {
    // BERILGAN: a COMPLETED assignment. HARAKAT: the admin adds a new
    // published required video.
    let course
    let topic
    let certificate

    test('AT-04 · the course is finished and the certificate is on record', async () => {
      ;({ course, topic } = await makeCourse('reopen'))
      const video = await addVideo(course, topic)
      await watch(course, video)
      await courseCompletionService.evaluate(learner._id, course._id)
      assert.equal(await statusOf(course), 'COMPLETED')

      // Standing in for the worker, which does not run in a test. The row is
      // what matters to AT-04: something was issued, and the reopening must
      // not touch it.
      certificate = await Certificate.create({
        serial: `AT04-${stamp}`,
        userId: learner._id,
        sourceType: 'COURSE',
        sourceId: course._id,
        fullName: learner.fullName,
        sourceTitle: course.title,
        pdfKey: `certificates/at04-${stamp}.pdf`,
      })
    })

    test('AT-04 · adding the video returns the assignment to ACTIVE', async () => {
      await addVideo(course, topic, { title: 'Yangi majburiy', order: 2, required: true })
      // Through evaluateCourse, not evaluate: the acceptance test's actor is
      // an admin editing the course, and the learner is not making a request
      // at that moment. Nobody would notice a fix that only worked when the
      // learner happened to click something.
      const totals = await courseCompletionService.evaluateCourse(course._id)
      assert.equal(totals.reopened, 1)
      assert.equal(await statusOf(course), 'ACTIVE')

      // Same reason as AT-01 above: the message has to be read in the test
      // that caused it, before `beforeEach` clears the collection again.
      // Silently flipping the status back would look like lost progress.
      const told = await Notification.find({ userId: learner._id, type: 'COURSE_REOPENED' }).lean()
      assert.equal(told.length, 1, 'the learner was not told why their course reopened')
      assert.equal(String(told[0].relatedEntityId), String(course._id))
    })

    test('AT-04 · the certificate already issued is NOT revoked', async () => {
      // Explicit in the acceptance test: the certificate recorded what was
      // true on the day it was earned. Revoking it for a change the learner
      // had no part in would be dishonest, and it is the kind of thing a
      // well-meaning "cascade the reopen" patch does by accident.
      const stored = await Certificate.findById(certificate._id).lean()
      assert.equal(stored.revokedAt, null)
      assert.equal(stored.pdfKey, `certificates/at04-${stamp}.pdf`)
    })

    test('AT-04 · the progress endpoint agrees it is no longer finished', async () => {
      const progress = await courseService.getMyProgress(learnerActor, course._id.toString())
      assert.ok(progress.completionPercent < 100)
      assert.equal(progress.totalItems, 2)
    })

    test('AT-04 · watching the new video finishes it again', async () => {
      const added = await Video.findOne({ courseId: course._id, title: 'Yangi majburiy' })
      await watch(course, added)
      const result = await courseCompletionService.evaluate(learner._id, course._id)
      assert.equal(result.complete, true)
      assert.equal(await statusOf(course), 'COMPLETED')
      const progress = await courseService.getMyProgress(learnerActor, course._id.toString())
      assert.equal(progress.completionPercent, 100)
    })
  })
})
