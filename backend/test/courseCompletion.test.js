// AT-01 … AT-04 — one definition of "this course is finished".
//
// There were two before 3.1, and they disagreed:
//
//   videoEventProcessor  decided completion from videos alone, behind a
//                        `publishedVideoIds.length > 0` guard
//   course.service       computed a percentage across videos, materials
//                        *and* assessments for the progress endpoint
//
// So a course made of a presentation and a test could never finish (AT-01),
// a course whose videos were done finished with its mandatory test failed
// (AT-02), and the two numbers a learner sees could contradict each other
// (AT-03). All three are the same bug, and the fix is that the percentage
// and the status now come from one call.

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
import { Notification } from '../src/models/notification.model.js'
import { MailLog } from '../src/models/mailLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import {
  courseCompletionService,
  collectCourseItems,
  summarize,
  meetsRule,
} from '../src/services/courses/courseCompletion.service.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0
let learner
let employeeRole
const courseIds = []
// Kept by name rather than looked up by slug: the slug carries a counter
// that also numbers topics, so it is not a stable handle.
const made = {}

async function makeCourse(rule, label) {
  const course = await Course.create({
    title: `Completion ${stamp}-${seq}`,
    description: 'x',
    slug: `completion-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: learner._id,
    ...(rule ? { completionRule: rule } : {}),
  })
  courseIds.push(course._id)
  const topic = await Topic.create({
    courseId: course._id,
    title: 'T',
    slug: `t-${stamp}-${seq++}`,
    order: 1,
    status: 'PUBLISHED',
    createdBy: learner._id,
  })
  await CourseAssignment.create({ userId: learner._id, courseId: course._id, assignedBy: learner._id })
  if (label) made[label] = { course, topic }
  return { course, topic }
}

const addVideo = (course, topic, extra = {}) =>
  Video.create({
    courseId: course._id,
    topicId: topic._id,
    title: 'V',
    order: 1,
    status: 'PUBLISHED',
    createdBy: learner._id,
    ...extra,
  })

const addMaterial = (course, topic) =>
  Material.create({
    courseId: course._id,
    topicId: topic._id,
    type: 'PRESENTATION',
    title: 'M',
    key: `k-${stamp}-${seq++}`,
    mimeType: 'application/pdf',
    status: 'PUBLISHED',
    createdBy: learner._id,
  })

const addAssessment = (course, topic) =>
  Assessment.create({
    courseId: course._id,
    topicId: topic._id,
    title: 'A',
    status: 'PUBLISHED',
    passScorePercent: 60,
    questions: [{ text: 'q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }],
    createdBy: learner._id,
  })

const statusOf = async (course) =>
  (await CourseAssignment.findOne({ userId: learner._id, courseId: course._id }).lean()).status

describe('course completion', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')
    learner = await User.create({
      firstName: 'Comp',
      lastName: 'Learner',
      fullName: 'Comp Learner',
      jshshir: `15${stamp}001`,
      passwordHash: await hashPassword('CompTest123!'),
      roleId: employeeRole._id,
    })
  })

  after(async () => {
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
    await User.deleteOne({ _id: learner._id })
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  beforeEach(async () => {
    await Notification.deleteMany({ userId: learner._id })
  })

  test('AT-01 · a course with no video at all can finish', async () => {
    // The exact case the old guard made impossible: one presentation, one
    // test, no video. `publishedVideoIds.length > 0` was never true, so the
    // assignment sat ACTIVE forever however much the learner did.
    const { course, topic } = await makeCourse(undefined, 'noVideo')
    const material = await addMaterial(course, topic)
    const assessment = await addAssessment(course, topic)

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
    await AssessmentAttempt.create({
      userId: learner._id,
      assessmentId: assessment._id,
      courseId: course._id,
      answers: [],
      scorePercent: 100,
      passed: true,
    })

    const result = await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(result.completionPercent, 100)
    assert.equal(result.complete, true)
    assert.equal(await statusOf(course), 'COMPLETED')

    // Asserted here rather than in its own test: `beforeEach` clears the
    // notifications, so a separate test would look at an empty collection.
    const told = await Notification.find({ userId: learner._id, type: 'COURSE_COMPLETED' }).lean()
    assert.equal(told.length, 1, 'the learner was not told their course finished')
  })

  test('AT-02 · videos done but the mandatory test failed is not finished', async () => {
    const { course, topic } = await makeCourse({ minPercent: 100, requireAllRequired: true }, 'failedTest')
    const video = await addVideo(course, topic)
    const assessment = await addAssessment(course, topic)

    await VideoProgress.create({
      userId: learner._id,
      courseId: course._id,
      videoId: video._id,
      completionPercent: 100,
      completedAt: new Date(),
    })
    await AssessmentAttempt.create({
      userId: learner._id,
      assessmentId: assessment._id,
      courseId: course._id,
      answers: [],
      scorePercent: 20,
      passed: false,
    })

    const result = await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(result.complete, false)
    assert.ok(result.completionPercent < 100, `expected under 100, got ${result.completionPercent}`)
    assert.equal(await statusOf(course), 'ACTIVE')
  })

  test('AT-02 · passing it later finishes the course', async () => {
    const { course } = made.failedTest
    const assessment = await Assessment.findOne({ courseId: course._id })
    await AssessmentAttempt.create({
      userId: learner._id,
      assessmentId: assessment._id,
      courseId: course._id,
      answers: [],
      scorePercent: 100,
      passed: true,
    })
    const result = await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(result.complete, true)
    assert.equal(await statusOf(course), 'COMPLETED')
  })

  test('AT-03 · 100% and COMPLETED can never disagree', async () => {
    // The property, not an example of it: for every course this learner has,
    // the percentage the progress endpoint reports and the assignment status
    // are computed from the same call, so they cannot drift.
    for (const courseId of courseIds) {
      const items = await collectCourseItems(courseId, learner._id)
      const { completionPercent } = summarize(items)
      const assignment = await CourseAssignment.findOne({ userId: learner._id, courseId }).lean()
      if (!assignment) continue
      const course = await Course.findById(courseId).lean()
      const complete = meetsRule(items, course.completionRule)
      assert.equal(
        assignment.status === 'COMPLETED',
        complete,
        `course ${course.slug}: status ${assignment.status} but rule says ${complete} at ${completionPercent}%`
      )
    }
  })

  test('AT-04 · adding a required lesson reopens a finished course', async () => {
    const { course, topic } = await makeCourse(undefined, 'reopen')
    const video = await addVideo(course, topic)
    await VideoProgress.create({
      userId: learner._id,
      courseId: course._id,
      videoId: video._id,
      completionPercent: 100,
      completedAt: new Date(),
    })
    await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(await statusOf(course), 'COMPLETED')

    await Notification.deleteMany({ userId: learner._id })
    await addVideo(course, topic, { title: 'V2', order: 2, required: true })

    const result = await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(result.complete, false)
    assert.equal(result.changed, true)
    assert.equal(await statusOf(course), 'ACTIVE')

    const reopened = await Notification.find({ userId: learner._id, type: 'COURSE_REOPENED' }).lean()
    assert.equal(reopened.length, 1, 'the learner was not told why their course reopened')
  })

  test('AT-04 · the completion date is cleared, not left behind', async () => {
    // A completion date on a course that is not complete is the kind of small
    // lie a report later repeats as fact.
    const { course } = made.reopen
    const assignment = await CourseAssignment.findOne({ userId: learner._id, courseId: course._id }).lean()
    assert.equal(assignment.completedAt, null)
  })

  test('a second evaluation does not send a second notification', async () => {
    // The transition is what triggers a message, not the state. Every write
    // in the system calls evaluate(), so this runs constantly.
    const { course } = made.noVideo
    await Notification.deleteMany({ userId: learner._id })
    const result = await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(result.changed, false)
    assert.equal(await Notification.countDocuments({ userId: learner._id }), 0)
  })

  test('an empty course is not complete — that would be a certificate for nothing', async () => {
    const { course } = await makeCourse()
    const result = await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(result.complete, false)
    assert.equal(result.totalItems, 0)
    assert.equal(await statusOf(course), 'ACTIVE')
  })

  test('a draft lesson does not hold a course back', async () => {
    // Completion is judged on published content: a learner cannot be blocked
    // by a lesson nobody has released.
    const { course, topic } = await makeCourse()
    const video = await addVideo(course, topic)
    await addVideo(course, topic, { title: 'Draft', order: 2, status: 'DRAFT' })
    await VideoProgress.create({
      userId: learner._id,
      courseId: course._id,
      videoId: video._id,
      completionPercent: 100,
      completedAt: new Date(),
    })
    const result = await courseCompletionService.evaluate(learner._id, course._id)
    assert.equal(result.totalItems, 1)
    assert.equal(result.complete, true)
  })

  describe('the rule', () => {
    const item = (over = {}) => ({ kind: 'video', share: 1, completed: true, required: true, ...over })

    test('minPercent lets a course finish on most of it', () => {
      const items = [item(), item(), item({ share: 0, completed: false, required: false })]
      assert.equal(meetsRule(items, { minPercent: 100, requireAllRequired: true }), false)
      assert.equal(meetsRule(items, { minPercent: 60, requireAllRequired: true }), true)
    })

    test('a required item still blocks it, whatever the percentage says', () => {
      // A course can be 60%-to-pass and still insist on the safety test.
      const items = [item(), item(), item({ share: 0, completed: false, required: true })]
      assert.equal(meetsRule(items, { minPercent: 60, requireAllRequired: true }), false)
      assert.equal(meetsRule(items, { minPercent: 60, requireAllRequired: false }), true)
    })

    test('no rule at all means everything, which is the safe default', () => {
      assert.equal(meetsRule([item(), item({ share: 0, completed: false })]), false)
      assert.equal(meetsRule([item(), item()]), true)
    })
  })
})
