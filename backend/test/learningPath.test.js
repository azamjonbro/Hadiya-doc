// AT-26 and AT-27 — sequential paths, and what counts as finishing one.
//
//   AT-26  a 4-course sequential path, first course unfinished
//          -> POST /video-access/:videoId/token for a course-2 video is
//             403 PREVIOUS_PATH_ITEM_INCOMPLETE, and no token is issued
//   AT-27  3 required + 2 optional courses, the 3 required ones finished
//          -> completionPercent 100, enrolment COMPLETED, certificate issued
//
// AT-26 is a bypass test: the lock is only real if it lives where the video
// bytes are handed out. A greyed-out row in the sidebar is presentation,
// and typing the URL walks straight past it.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { LearningPath } from '../src/models/learningPath.model.js'
import { PathEnrollment } from '../src/models/pathEnrollment.model.js'
import { CertificateTemplate } from '../src/models/certificateTemplate.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { videoAccessService } from '../src/services/videos/videoAccess.service.js'
import { pathEnrollmentService } from '../src/services/paths/pathEnrollment.service.js'
import { computeItemLocks, summarizeEnrollment } from '../src/services/paths/pathSequence.js'
import { certificateQueue } from '../src/jobs/certificateQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let learner
let actor
let template
let courses = []
let videos = []
let sequentialPath
let mixedPath

async function makeCourse(index) {
  const course = await Course.create({
    title: `Path course ${index} ${stamp}`,
    slug: `path-course-${index}-${stamp}`,
    status: 'PUBLISHED',
    createdBy: learner._id,
  })
  const topic = await Topic.create({
    courseId: course._id,
    title: 'Module',
    slug: 'module',
    status: 'PUBLISHED',
    createdBy: learner._id,
  })
  const video = await Video.create({
    courseId: course._id,
    topicId: topic._id,
    title: `Lesson ${index}`,
    status: 'PUBLISHED',
    processingStatus: 'READY',
    hlsManifestKey: `processed/path-${index}-${stamp}/master.m3u8`,
    createdBy: learner._id,
  })
  return { course, video }
}

describe('learning paths (5.1)', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    learner = await User.create({
      firstName: 'Path',
      lastName: 'Walker',
      fullName: 'Path Walker',
      jshshir: `17${stamp}`,
      passwordHash: await hashPassword('PathTest123!'),
      roleId: employeeRole._id,
    })
    actor = { id: learner._id.toString(), roleName: 'EMPLOYEE', permissions: [] }

    template = await CertificateTemplate.create({ name: `Path template ${stamp}`, createdBy: learner._id })

    for (let index = 1; index <= 5; index += 1) {
      const made = await makeCourse(index)
      courses.push(made.course)
      videos.push(made.video)
    }

    sequentialPath = await LearningPath.create({
      title: `Sequential path ${stamp}`,
      slug: `sequential-path-${stamp}`,
      status: 'PUBLISHED',
      sequential: true,
      items: courses.slice(0, 4).map((course, index) => ({
        type: 'COURSE',
        refId: course._id,
        order: index,
        required: true,
      })),
      createdBy: learner._id,
    })

    mixedPath = await LearningPath.create({
      title: `Mixed path ${stamp}`,
      slug: `mixed-path-${stamp}`,
      status: 'PUBLISHED',
      // Not sequential: AT-27 is about what counts, not about order.
      sequential: false,
      certificateTemplateId: template._id,
      items: [
        { type: 'COURSE', refId: courses[0]._id, order: 0, required: true },
        { type: 'COURSE', refId: courses[1]._id, order: 1, required: true },
        { type: 'COURSE', refId: courses[2]._id, order: 2, required: true },
        { type: 'COURSE', refId: courses[3]._id, order: 3, required: false },
        { type: 'COURSE', refId: courses[4]._id, order: 4, required: false },
      ],
      createdBy: learner._id,
    })
  })

  after(async () => {
    const courseIds = courses.map((course) => course._id)
    await Promise.all([
      Video.deleteMany({ courseId: { $in: courseIds } }),
      Topic.deleteMany({ courseId: { $in: courseIds } }),
      CourseAssignment.deleteMany({ courseId: { $in: courseIds } }),
      PathEnrollment.deleteMany({ userId: learner._id }),
      LearningPath.deleteMany({ _id: { $in: [sequentialPath._id, mixedPath._id] } }),
      CertificateTemplate.deleteOne({ _id: template._id }),
    ])
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteOne({ _id: learner._id })
    await certificateQueue.close()
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('AT-26 · a sequential path blocks on the server', () => {
    before(async () => {
      await pathEnrollmentService.enroll({ id: learner._id }, learner._id, sequentialPath._id)
    })

    test('enrolling assigns the path’s courses', async () => {
      // Otherwise the path is a list of things the learner cannot open, and
      // the first thing they do is ask why.
      const assignments = await CourseAssignment.countDocuments({
        userId: learner._id,
        courseId: { $in: courses.slice(0, 4).map((course) => course._id) },
      })
      assert.equal(assignments, 4)
    })

    test('the second course refuses a playback token while the first is unfinished', async () => {
      await assert.rejects(
        () => videoAccessService.issueToken(actor, videos[1]._id.toString()),
        (error) => {
          assert.equal(error.statusCode, 403)
          assert.equal(error.code, 'PREVIOUS_PATH_ITEM_INCOMPLETE')
          return true
        }
      )
    })

    test('the first course opens', async () => {
      const result = await videoAccessService.issueToken(actor, videos[0]._id.toString())
      assert.ok(result.token, 'the first item of a path is never locked')
    })

    test('finishing the first course opens the second', async () => {
      await CourseAssignment.updateOne(
        { userId: learner._id, courseId: courses[0]._id },
        { $set: { status: 'COMPLETED', completedAt: new Date() } }
      )
      const result = await videoAccessService.issueToken(actor, videos[1]._id.toString())
      assert.ok(result.token)

      // ...and only the second. The third is still behind the second.
      await assert.rejects(
        () => videoAccessService.issueToken(actor, videos[2]._id.toString()),
        (error) => error.code === 'PREVIOUS_PATH_ITEM_INCOMPLETE'
      )
    })

    test('staff are not sequenced — they have to be able to review any course', async () => {
      const reviewer = { id: learner._id.toString(), roleName: 'EMPLOYEE', permissions: ['course:create'] }
      const result = await videoAccessService.issueToken(reviewer, videos[3]._id.toString())
      assert.ok(result.token)
    })
  })

  describe('AT-27 · optional items do not change the percentage', () => {
    before(async () => {
      await pathEnrollmentService.enroll({ id: learner._id }, learner._id, mixedPath._id)
      // The three required ones, and neither optional one.
      await CourseAssignment.updateMany(
        { userId: learner._id, courseId: { $in: courses.slice(0, 3).map((course) => course._id) } },
        { $set: { status: 'COMPLETED', completedAt: new Date() } }
      )
    })

    test('three required of three is 100%, with two optional untouched', async () => {
      const result = await pathEnrollmentService.evaluate(learner._id, mixedPath._id)
      assert.equal(result.completionPercent, 100)
      assert.equal(result.totalRequired, 3)
      assert.equal(result.status, 'COMPLETED')
    })

    test('the enrolment records it', async () => {
      const enrollment = await PathEnrollment.findOne({ userId: learner._id, pathId: mixedPath._id }).lean()
      assert.equal(enrollment.status, 'COMPLETED')
      assert.equal(enrollment.completionPercent, 100)
      assert.ok(enrollment.completedAt)
      // The optional items are still listed, just not counted.
      assert.equal(enrollment.itemStates.length, 5)
    })

    test('a certificate is queued for the finished path', async () => {
      const jobs = await certificateQueue.getJobs(['waiting', 'active', 'completed', 'delayed'], 0, 50)
      const mine = jobs.find(
        (job) => job.data.sourceType === 'PATH' && String(job.data.sourceId) === String(mixedPath._id)
      )
      assert.ok(mine, 'finishing a path with a template configured has to queue its certificate')
      assert.equal(String(mine.data.userId), String(learner._id))
    })

    test('finishing an optional course afterwards does not push it past 100', async () => {
      await CourseAssignment.updateOne(
        { userId: learner._id, courseId: courses[3]._id },
        { $set: { status: 'COMPLETED', completedAt: new Date() } }
      )
      const result = await pathEnrollmentService.evaluate(learner._id, mixedPath._id)
      assert.equal(result.completionPercent, 100)
      assert.equal(result.changed, false, 'already complete — nothing transitions, so nobody is congratulated twice')
    })
  })

  describe('the rules themselves', () => {
    const path = {
      sequential: true,
      items: [
        { refId: 'a', order: 0, required: true },
        { refId: 'b', order: 1, required: false },
        { refId: 'c', order: 2, required: true },
      ],
    }

    test('an optional item cannot wall off the rest of the path', () => {
      // Same rule as an optional video inside a course: skipping the extra
      // reading must not close the programme.
      const locks = computeItemLocks(path, ['a'])
      assert.equal(locks.c.locked, false)
    })

    test('an unfinished required item closes everything after it', () => {
      const locks = computeItemLocks(path, [])
      assert.equal(locks.a.locked, false)
      assert.equal(locks.b.locked, true)
      assert.equal(locks.c.locked, true)
    })

    test('a completed item never re-locks', () => {
      const locks = computeItemLocks(path, ['a', 'b', 'c'])
      assert.deepEqual(Object.values(locks).map((state) => state.locked), [false, false, false])
    })

    test('an explicit prerequisite applies even without sequencing', () => {
      const free = {
        sequential: false,
        items: [
          { refId: 'x', order: 0, required: true },
          { refId: 'y', order: 1, required: true, prerequisiteIds: ['x'] },
        ],
      }
      assert.equal(computeItemLocks(free, []).y.locked, true)
      assert.equal(computeItemLocks(free, ['x']).y.locked, false)
    })

    test('an empty path is not complete', () => {
      // Calling it finished would hand out a certificate for nothing.
      assert.equal(summarizeEnrollment({ items: [] }, []).complete, false)
    })

    test('a path of only optional items is not complete either', () => {
      const optionalOnly = { items: [{ refId: 'a', order: 0, required: false }] }
      assert.equal(summarizeEnrollment(optionalOnly, ['a']).complete, false)
    })
  })
})
