// 3.5 — duplicating a course.
//
// Two properties matter, and they pull in opposite directions:
//
//   1. The content has to come across in full — topics, videos, documents,
//      tests with their questions, and the quiz bound to each video — with
//      every parent reference re-pointed at the copy. A single missed remap
//      leaves a row in the new course pointing at the old course's topic,
//      which is the sort of thing that only surfaces when somebody deletes
//      the original a month later.
//
//   2. Nothing belonging to a person may come across. A duplicated course is
//      a course nobody has taken; carrying an assignment or a completion
//      onto it would put a fictional completion into the compliance report.
//
// Media is shared rather than re-uploaded, which is the third thing tested
// here: the copy references the same storage keys, and deleting one copy's
// video must not delete the file the other one is still playing.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { Material } from '../src/models/material.model.js'
import { Assessment } from '../src/models/assessment.model.js'
import { Quiz } from '../src/models/quiz.model.js'
import { Lesson } from '../src/models/lesson.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { courseDuplicateService } from '../src/services/courses/courseDuplicate.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let admin
let source
let sourceTopic
let sourceVideo
let copy
let counts
const courseIds = []

describe('course duplication (3.5)', () => {
  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    admin = await User.create({
      firstName: 'Dup',
      lastName: 'Author',
      fullName: 'Dup Author',
      jshshir: `52${stamp}`,
      passwordHash: await hashPassword('DupTest123!'),
      roleId: employeeRole._id,
    })

    source = await Course.create({
      title: `Original course ${stamp}`,
      slug: `original-course-${stamp}`,
      description: 'The one being copied',
      status: 'PUBLISHED',
      tags: ['xavfsizlik'],
      level: 'ADVANCED',
      estimatedMinutes: 45,
      version: 4,
      createdBy: admin._id,
    })
    courseIds.push(source._id)

    sourceTopic = await Topic.create({
      courseId: source._id,
      title: 'Module one',
      slug: 'module-one',
      order: 0,
      status: 'PUBLISHED',
      createdBy: admin._id,
    })

    sourceVideo = await Video.create({
      courseId: source._id,
      topicId: sourceTopic._id,
      title: 'Lesson one',
      status: 'PUBLISHED',
      order: 0,
      originalKey: `originals/shared-${stamp}.mp4`,
      hlsManifestKey: `processed/shared-${stamp}/master.m3u8`,
      processingStatus: 'READY',
      createdBy: admin._id,
    })

    await Material.create({
      courseId: source._id,
      topicId: sourceTopic._id,
      type: 'FILE',
      title: 'Handbook',
      key: `materials/shared-${stamp}.pdf`,
      mimeType: 'application/pdf',
      status: 'PUBLISHED',
      createdBy: admin._id,
    })

    await Assessment.create({
      courseId: source._id,
      topicId: sourceTopic._id,
      title: 'Final test',
      status: 'PUBLISHED',
      questions: [
        { text: 'Is this copied?', options: [{ text: 'Yes', isCorrect: true }, { text: 'No' }], order: 0 },
      ],
      createdBy: admin._id,
    })

    // A text lesson is the fourth kind of content a topic can hold (9.1),
    // so "every kind" includes one.
    await Lesson.create({
      courseId: source._id,
      topicId: sourceTopic._id,
      title: 'Kirish darsi',
      blocks: [{ type: 'TEXT', text: '<p>Matn</p>' }],
      status: 'PUBLISHED',
      createdBy: admin._id,
    })

    await Quiz.create({
      courseId: source._id,
      videoId: sourceVideo._id,
      questions: [{ text: 'Watched it?', options: [{ text: 'Yes', isCorrect: true }], order: 0 }],
      createdBy: admin._id,
    })

    // Somebody's history on the original. None of this may be copied.
    await CourseAssignment.create({
      userId: admin._id,
      courseId: source._id,
      status: 'COMPLETED',
      assignedBy: admin._id,
      completedAt: new Date(),
    })

    const result = await courseDuplicateService.duplicate({ id: admin._id.toString() }, source._id)
    copy = result.course
    counts = result.counts
    courseIds.push(new mongoose.Types.ObjectId(copy.id))
  })

  after(async () => {
    for (const id of courseIds) {
      await Promise.all([
        Topic.deleteMany({ courseId: id }),
        Video.deleteMany({ courseId: id }),
        Material.deleteMany({ courseId: id }),
        Assessment.deleteMany({ courseId: id }),
        Quiz.deleteMany({ courseId: id }),
        Lesson.deleteMany({ courseId: id }),
        CourseAssignment.deleteMany({ courseId: id }),
      ])
    }
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteOne({ _id: admin._id })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  test('copies every kind of content once', () => {
    assert.deepEqual(counts, { topics: 1, videos: 1, materials: 1, assessments: 1, lessons: 1, quizzes: 1 })
  })

  test('the copy is a draft, whatever the original was', () => {
    // Otherwise one click publishes a half-edited duplicate of a live
    // course to everyone the original targets.
    assert.equal(copy.status, 'DRAFT')
    assert.notEqual(copy.id, String(source._id))
  })

  test('carries the metadata but starts its own version history', () => {
    assert.deepEqual(copy.tags, ['xavfsizlik'])
    assert.equal(copy.level, 'ADVANCED')
    assert.equal(copy.estimatedMinutes, 45)
    assert.equal(copy.version, 1, 'the copy is version 1 of itself, not a continuation of the original')
  })

  test('gets its own slug', async () => {
    assert.notEqual(copy.slug, source.slug)
    const bySlug = await Course.countDocuments({ slug: copy.slug })
    assert.equal(bySlug, 1)
  })

  test('every child points at the copy, not at the original', async () => {
    const [topic] = await Topic.find({ courseId: copy.id }).lean()
    const [video] = await Video.find({ courseId: copy.id }).lean()
    const [material] = await Material.find({ courseId: copy.id }).lean()
    const [assessment] = await Assessment.find({ courseId: copy.id }).lean()
    const [quiz] = await Quiz.find({ courseId: copy.id }).lean()

    // The remap is the part that breaks silently: a video left pointing at
    // the original's topic looks fine until the original is deleted.
    assert.equal(String(video.topicId), String(topic._id))
    assert.equal(String(material.topicId), String(topic._id))
    assert.equal(String(assessment.topicId), String(topic._id))
    assert.equal(String(quiz.videoId), String(video._id))
    assert.notEqual(String(topic._id), String(sourceTopic._id))
    assert.notEqual(String(video._id), String(sourceVideo._id))
  })

  test('test questions come across, with their own ids', async () => {
    const [assessment] = await Assessment.find({ courseId: copy.id }).lean()
    const [original] = await Assessment.find({ courseId: source._id }).lean()
    assert.equal(assessment.questions.length, 1)
    assert.equal(assessment.questions[0].text, 'Is this copied?')
    assert.equal(assessment.questions[0].options[0].isCorrect, true)
    // Fresh ids: an attempt records the question id it answered, and two
    // courses sharing one would make those attempts ambiguous.
    assert.notEqual(String(assessment.questions[0]._id), String(original.questions[0]._id))
  })

  test('nobody is assigned to the copy', async () => {
    const assignments = await CourseAssignment.countDocuments({ courseId: copy.id })
    assert.equal(assignments, 0, 'a duplicated course is one nobody has taken')
  })

  test('media is referenced, not re-uploaded', async () => {
    const [video] = await Video.find({ courseId: copy.id }).lean()
    const [material] = await Material.find({ courseId: copy.id }).lean()
    // Gigabytes are not copied to make an editable copy of a syllabus.
    // Streaming resolves segments from the manifest key rather than the
    // video id, so the shared key plays correctly from either course.
    assert.equal(video.originalKey, sourceVideo.originalKey)
    assert.equal(video.hlsManifestKey, sourceVideo.hlsManifestKey)
    assert.equal(material.key, `materials/shared-${stamp}.pdf`)

    // And because the file is shared, a delete has to count references
    // before removing it — see video.service.js.
    const sharing = await Video.countDocuments({ originalKey: sourceVideo.originalKey })
    assert.equal(sharing, 2)
  })
})
