// 5.4 — onboarding programmes.
//
// The design question is what "done" means per step type, and the answer
// differs on purpose:
//
//   COURSE   ticked by the learner's ordinary progress, so nobody has to
//            remember to come back and mark it
//   TASK     a real Task in their task list, with its own deadline and
//            reminders, rather than a second kind of to-do
//   MANUAL   a checkbox, because "collect your laptop" has nothing in the
//            database to point at
//
// And the rule that keeps a checklist honest: the new hire cannot tick a
// step somebody else is responsible for.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { Task } from '../src/models/task.model.js'
import { OnboardingProgram } from '../src/models/onboardingProgram.model.js'
import { OnboardingEnrollment } from '../src/models/onboardingEnrollment.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { onboardingService, matchesProgram } from '../src/services/onboarding/onboarding.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Onboarding-${stamp}`

let employeeRole
let manager
let newHire
let outsider
let course
let program
let enrollment
const userIds = []

async function makeUser(name, extra = {}) {
  const user = await User.create({
    firstName: name,
    lastName: 'Hire',
    fullName: `${name} Hire`,
    jshshir: `39${userIds.length}${stamp}`,
    passwordHash: await hashPassword('OnboardTest123!'),
    roleId: employeeRole._id,
    ...extra,
  })
  userIds.push(user._id)
  return user
}

describe('onboarding (5.4)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    manager = await makeUser('Rahbar', { department: DEPT })
    newHire = await makeUser('Yangi', { department: DEPT, managerId: manager._id, hireDate: new Date('2026-09-01') })
    outsider = await makeUser('Boshqa', { department: `Other-${stamp}` })

    course = await Course.create({
      title: `Onboarding course ${stamp}`,
      slug: `onboarding-course-${stamp}`,
      status: 'PUBLISHED',
      createdBy: manager._id,
    })

    program = await OnboardingProgram.create({
      name: `First week ${stamp}`,
      status: 'ACTIVE',
      autoStart: true,
      departments: [DEPT],
      steps: [
        { type: 'COURSE', refId: course._id, title: 'Safety course', dueDays: 3, order: 0, ownerRole: 'EMPLOYEE' },
        { type: 'TASK', title: 'Meet your mentor', dueDays: 5, order: 1, ownerRole: 'EMPLOYEE' },
        { type: 'MANUAL', title: 'Issue the access card', dueDays: 1, order: 2, ownerRole: 'MANAGER' },
        { type: 'MANUAL', title: 'Optional reading', dueDays: 30, order: 3, required: false, ownerRole: 'EMPLOYEE' },
      ],
      createdBy: manager._id,
    })
  })

  after(async () => {
    await Promise.all([
      OnboardingEnrollment.deleteMany({ programId: program._id }),
      OnboardingProgram.deleteOne({ _id: program._id }),
      CourseAssignment.deleteMany({ courseId: course._id }),
      Task.deleteMany({ assignedBy: { $in: userIds } }),
    ])
    await Course.deleteOne({ _id: course._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('starting', () => {
    test('the daily pass starts it for whoever has arrived and matches', async () => {
      const totals = await onboardingService.autoStartDue({ now: new Date('2026-09-08') })
      assert.ok(totals.started >= 1)

      enrollment = await OnboardingEnrollment.findOne({ userId: newHire._id, programId: program._id })
      assert.ok(enrollment, 'the new hire has to be enrolled')
      // Somebody in another department is not on the programme.
      const other = await OnboardingEnrollment.findOne({ userId: outsider._id, programId: program._id })
      assert.equal(other, null)
    })

    test('the clock starts on the hire date, not on the day the job ran', async () => {
      // Otherwise somebody entered a week late quietly gets a week longer.
      assert.equal(enrollment.startedAt.toISOString().slice(0, 10), '2026-09-01')
      const first = enrollment.stepStates[0]
      assert.equal(first.dueAt.toISOString().slice(0, 10), '2026-09-04')
    })

    test('the manager is copied onto the enrolment, not joined', async () => {
      // Whoever owns this checklist is the manager they had on day one; a
      // reorganisation in week three must not orphan it.
      assert.equal(String(enrollment.managerId), String(manager._id))
    })

    test('running the daily pass again does not start a second checklist', async () => {
      await onboardingService.autoStartDue({ now: new Date('2026-09-08') })
      const count = await OnboardingEnrollment.countDocuments({ userId: newHire._id, programId: program._id })
      assert.equal(count, 1)
    })
  })

  describe('what the steps become', () => {
    test('a course step becomes a real assignment with the step’s deadline', async () => {
      const assignment = await CourseAssignment.findOne({ userId: newHire._id, courseId: course._id }).lean()
      assert.ok(assignment, 'a course step has to produce an assignment, or it can never be completed')
      assert.equal(assignment.deadline.toISOString().slice(0, 10), '2026-09-04')
    })

    test('a task step becomes a Task in the right person’s list', async () => {
      const state = enrollment.stepStates[1]
      assert.ok(state.taskId, 'the step and the task the person sees have to stay connected')
      const task = await Task.findById(state.taskId).lean()
      assert.equal(task.title, 'Meet your mentor')
      assert.equal(String(task.assignedTo), String(newHire._id))
      // The same fan-out fields a broadcast uses, so "what did this
      // onboarding produce" is one query.
      assert.equal(String(task.batchId), String(enrollment._id))
    })

    test('a manager-owned step belongs to the manager', async () => {
      const program_ = await OnboardingProgram.findById(program._id).lean()
      const cardStep = program_.steps.find((step) => step.title === 'Issue the access card')
      const owner = onboardingService.ownerFor(cardStep, enrollment)
      // The new hire cannot issue their own access card, and asking them to
      // tick it is how a checklist becomes fiction.
      assert.equal(String(owner), String(manager._id))
    })
  })

  describe('progress', () => {
    test('finishing the course ticks its step without anybody marking it', async () => {
      await CourseAssignment.updateOne(
        { userId: newHire._id, courseId: course._id },
        { $set: { status: 'COMPLETED', completedAt: new Date() } }
      )
      const result = await onboardingService.evaluate(newHire._id, program._id)
      const updated = await OnboardingEnrollment.findById(enrollment._id).lean()
      assert.equal(updated.stepStates[0].status, 'COMPLETED')
      // One of three required steps.
      assert.equal(result.completionPercent, 33)
    })

    test('closing the task ticks its step', async () => {
      const state = (await OnboardingEnrollment.findById(enrollment._id).lean()).stepStates[1]
      await Task.updateOne({ _id: state.taskId }, { $set: { status: 'COMPLETED' } })
      const result = await onboardingService.evaluate(newHire._id, program._id)
      assert.equal(result.completionPercent, 67)
    })

    test('the new hire cannot tick a step the manager owns', async () => {
      const program_ = await OnboardingProgram.findById(program._id).lean()
      const cardStep = program_.steps.find((step) => step.title === 'Issue the access card')
      await assert.rejects(
        () =>
          onboardingService.completeStep(
            { id: newHire._id.toString(), permissions: [] },
            enrollment._id,
            cardStep._id
          ),
        (error) => error.code === 'NOT_STEP_OWNER'
      )
    })

    test('the manager can, and that completes the programme', async () => {
      const program_ = await OnboardingProgram.findById(program._id).lean()
      const cardStep = program_.steps.find((step) => step.title === 'Issue the access card')
      const result = await onboardingService.completeStep(
        { id: manager._id.toString(), permissions: [] },
        enrollment._id,
        cardStep._id
      )
      // Three required steps done; the optional one is untouched and does
      // not hold anybody back.
      assert.equal(result.completionPercent, 100)
      assert.equal(result.status, 'COMPLETED')

      const stored = await OnboardingEnrollment.findById(enrollment._id).lean()
      assert.equal(stored.stepStates[3].status, 'PENDING', 'the optional step stays open')
      assert.equal(String(stored.stepStates[2].completedBy), String(manager._id))
    })
  })

  describe('audience matching', () => {
    test('an unconstrained programme catches everybody who joins', () => {
      // Unlike an enrolment rule, "everybody who joins" is the common case
      // for onboarding, so an empty audience is meaningful here.
      assert.equal(matchesProgram({ department: 'Anything' }, {}), true)
    })

    test('constraints combine with AND', () => {
      const scoped = { departments: [DEPT], positions: ['Welder'] }
      assert.equal(matchesProgram({ department: DEPT, position: 'Welder' }, scoped), true)
      assert.equal(matchesProgram({ department: DEPT, position: 'Driver' }, scoped), false)
    })
  })
})
