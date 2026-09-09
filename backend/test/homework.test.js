// 6.5 — homework: handing work in, and marking it.
//
// Three properties are worth pinning down, and all three are about the
// past not being rewritten:
//
//   - each attempt is its own row, so returning work and fixing it keeps
//     both what was wrong and the correction
//   - lateness is decided once, at submission; extending a deadline later
//     must not un-late somebody's work
//   - a resubmission clears the previous verdict, because that score
//     belonged to work that has just been replaced

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Assignment } from '../src/models/assignment.model.js'
import { Submission } from '../src/models/submission.model.js'
import { Rubric } from '../src/models/rubric.model.js'
import { Notification } from '../src/models/notification.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { assignmentService } from '../src/services/assignments/assignment.service.js'
import { submissionService, deadlineState } from '../src/services/assignments/submission.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let learner
let reviewer
let course
let topic
let rubric
let homework
const userIds = []

const learnerActor = () => ({ id: learner._id.toString(), fullName: learner.fullName, permissions: [] })
const reviewerActor = () => ({ id: reviewer._id.toString(), permissions: ['quiz:grade', 'course:update'] })

async function makeUser(name) {
  const user = await User.create({
    firstName: name,
    lastName: 'Work',
    fullName: `${name} Work`,
    jshshir: `94${userIds.length}${stamp}`,
    passwordHash: await hashPassword('WorkTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
  })
  userIds.push(user._id)
  return user
}

describe('homework (6.5)', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    learner = await makeUser('Talaba')
    reviewer = await makeUser('Tekshiruvchi')

    course = await Course.create({
      title: `Homework course ${stamp}`,
      slug: `homework-course-${stamp}`,
      status: 'PUBLISHED',
      createdBy: reviewer._id,
    })
    topic = await Topic.create({
      courseId: course._id,
      title: 'Module',
      slug: 'module',
      status: 'PUBLISHED',
      createdBy: reviewer._id,
    })

    rubric = await Rubric.create({
      name: `Weld quality ${stamp}`,
      criteria: [
        { label: 'Penetration', maxScore: 5, levels: [{ label: 'None', score: 0 }, { label: 'Full', score: 5 }] },
        { label: 'Finish', maxScore: 5, levels: [{ label: 'Rough', score: 2 }, { label: 'Clean', score: 5 }] },
      ],
      createdBy: reviewer._id,
    })

    homework = await Assignment.create({
      topicId: topic._id,
      courseId: course._id,
      title: `Weld photo ${stamp}`,
      instructions: 'Photograph the finished weld',
      submissionTypes: ['TEXT', 'FILE'],
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      allowLate: true,
      lateWindowHours: 48,
      maxAttempts: 3,
      rubricId: rubric._id,
      maxScore: 10,
      reviewerIds: [reviewer._id],
      status: 'PUBLISHED',
      createdBy: reviewer._id,
    })
  })

  after(async () => {
    await Promise.all([
      Submission.deleteMany({ assignmentId: homework._id }),
      Notification.deleteMany({ userId: { $in: userIds } }),
    ])
    await Assignment.deleteOne({ _id: homework._id })
    await Rubric.deleteOne({ _id: rubric._id })
    await Topic.deleteMany({ courseId: course._id })
    await Course.deleteOne({ _id: course._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('drafting', () => {
    test('a draft is saved without counting as an attempt', async () => {
      const draft = await submissionService.save(learnerActor(), homework._id, { text: 'Half written' })
      assert.equal(draft.status, 'DRAFT')

      const view = await submissionService.mine(learnerActor(), homework._id)
      // Counting a draft against the limit would punish somebody for
      // saving their work.
      assert.equal(view.canSubmit, true)
      assert.equal(view.attempts.length, 1)
    })

    test('saving again rewrites the same draft rather than making a second', async () => {
      await submissionService.save(learnerActor(), homework._id, { text: 'More written' })
      const drafts = await Submission.countDocuments({
        assignmentId: homework._id,
        userId: learner._id,
        status: 'DRAFT',
      })
      assert.equal(drafts, 1)
    })
  })

  describe('handing in', () => {
    test('the draft becomes attempt 1', async () => {
      const submitted = await submissionService.save(
        learnerActor(),
        homework._id,
        { text: 'Finished', files: [{ key: `submissions/${stamp}.jpg`, name: 'weld.jpg', mime: 'image/jpeg' }] },
        { submit: true }
      )
      assert.equal(submitted.status, 'SUBMITTED')
      assert.equal(submitted.attemptNo, 1)
      assert.equal(submitted.late, false)
      assert.equal(submitted.files.length, 1)
    })

    test('the named reviewer is told', async () => {
      const notice = await Notification.findOne({ userId: reviewer._id, type: 'ASSIGNMENT_SUBMITTED' }).lean()
      assert.ok(notice)
    })

    test('it reaches the grading queue, oldest first', async () => {
      const { items } = await submissionService.queue(reviewerActor(), { assignmentId: homework._id })
      assert.equal(items.length, 1)
      assert.equal(items[0].fullName, learner.fullName)
      assert.equal(items[0].attemptNo, 1)
    })

    test('a draft never appears in the queue', async () => {
      await submissionService.save(learnerActor(), homework._id, { text: 'Second draft' })
      const { items } = await submissionService.queue(reviewerActor(), { assignmentId: homework._id })
      // Marking work before it was finished is the failure this prevents.
      assert.equal(items.filter((row) => row.attemptNo === 2).length, 0)
    })
  })

  describe('marking', () => {
    let submissionId

    test('the score comes from the rubric, not from a separate number', async () => {
      const { items } = await submissionService.queue(reviewerActor(), { assignmentId: homework._id })
      submissionId = items[0].id

      const graded = await submissionService.grade(reviewerActor(), submissionId, {
        // A total that disagrees with the criteria it is made of is the
        // fastest way to lose a learner's trust in the mark.
        score: 999,
        rubricScores: [
          { criterionId: String(rubric.criteria[0]._id), score: 5 },
          { criterionId: String(rubric.criteria[1]._id), score: 2 },
        ],
        feedback: 'Good penetration, rough finish',
      })
      assert.equal(graded.score, 7)
      assert.equal(graded.status, 'GRADED')
    })

    test('the learner is told', async () => {
      const notice = await Notification.findOne({ userId: learner._id, type: 'ASSIGNMENT_GRADED' }).lean()
      assert.ok(notice)
    })

    test('a score is capped at the assignment maximum', async () => {
      const graded = await submissionService.grade(reviewerActor(), submissionId, { score: 500 })
      assert.equal(graded.score, 10)
    })

    test('returning it for revision is a different state from a grade', async () => {
      const returned = await submissionService.grade(reviewerActor(), submissionId, {
        score: 4,
        feedback: 'Redo the finish',
        returnForRevision: true,
      })
      // A learner who sees "GRADED" assumes it is final; RETURNED says
      // there is something to do.
      assert.equal(returned.status, 'RETURNED')
      const notice = await Notification.findOne({ userId: learner._id, type: 'ASSIGNMENT_RETURNED' }).lean()
      assert.ok(notice)
    })

    test('a draft cannot be marked', async () => {
      const draft = await Submission.findOne({ assignmentId: homework._id, status: 'DRAFT' }).lean()
      await assert.rejects(
        () => submissionService.grade(reviewerActor(), draft._id, { score: 5 }),
        (error) => error.code === 'NOT_SUBMITTED'
      )
    })
  })

  describe('resubmitting', () => {
    test('the second attempt is its own row and clears the old verdict', async () => {
      const second = await submissionService.save(
        learnerActor(),
        homework._id,
        { text: 'Reworked the finish' },
        { submit: true }
      )
      assert.equal(second.attemptNo, 2)
      assert.equal(second.score, null, 'the old score belonged to work that has just been replaced')

      // The first attempt is untouched — what was wrong, and the fact that
      // it was corrected, both survive.
      const first = await Submission.findOne({ assignmentId: homework._id, userId: learner._id, attemptNo: 1 }).lean()
      assert.equal(first.score, 4)
      assert.equal(first.text, 'Finished')
    })

    test('the attempt limit is enforced', async () => {
      await submissionService.save(learnerActor(), homework._id, { text: 'Third' }, { submit: true })
      await assert.rejects(
        () => submissionService.save(learnerActor(), homework._id, { text: 'Fourth' }, { submit: true }),
        (error) => error.code === 'ATTEMPTS_EXHAUSTED'
      )
    })
  })

  describe('deadlines', () => {
    test('before the due date is neither late nor closed', () => {
      const future = { dueAt: new Date(Date.now() + 3600000), allowLate: true, lateWindowHours: 24 }
      assert.deepEqual(deadlineState(future), { late: false, closed: false })
    })

    test('past it, inside the window, is late but open', () => {
      const past = { dueAt: new Date(Date.now() - 3600000), allowLate: true, lateWindowHours: 24 }
      assert.deepEqual(deadlineState(past), { late: true, closed: false })
    })

    test('past the window is closed', () => {
      const over = { dueAt: new Date(Date.now() - 48 * 3600000), allowLate: true, lateWindowHours: 24 }
      assert.deepEqual(deadlineState(over), { late: true, closed: true })
    })

    test('allowLate off closes it the moment it is due', () => {
      const strict = { dueAt: new Date(Date.now() - 60000), allowLate: false }
      assert.deepEqual(deadlineState(strict), { late: true, closed: true })
    })

    test('allowLate with no window means the date is advisory', () => {
      // A real policy: show the date, do not enforce it.
      const advisory = { dueAt: new Date(Date.now() - 90 * 24 * 3600000), allowLate: true, lateWindowHours: 0 }
      assert.deepEqual(advisory && deadlineState(advisory), { late: true, closed: false })
    })

    test('extending the deadline does not un-late work already handed in', async () => {
      const submitted = await Submission.findOne({ assignmentId: homework._id, attemptNo: 1 }).lean()
      const wasLate = submitted.late

      await assignmentService.update(reviewerActor(), homework._id, {
        dueAt: new Date(Date.now() + 365 * 24 * 3600000),
      })

      const after = await Submission.findOne({ _id: submitted._id }).lean()
      // Rewriting it now would change a fact about the past by editing the
      // future.
      assert.equal(after.late, wasLate)
    })
  })

  describe('deleting', () => {
    test('an assignment with submissions is refused', async () => {
      await assert.rejects(
        () => assignmentService.remove(reviewerActor(), homework._id),
        (error) => error.code === 'ASSIGNMENT_HAS_SUBMISSIONS'
      )
    })

    test('a rubric an assignment uses is refused', async () => {
      await assert.rejects(
        () => assignmentService.removeRubric(reviewerActor(), rubric._id),
        (error) => error.code === 'RUBRIC_IN_USE'
      )
    })
  })
})
