// AT-34 — recurring training reassigns itself.
//
//   GIVEN RecurringAssignment { intervalMonths: 12, dueDays: 30 } and an
//         employee who finished 12 months ago
//   WHEN  the daily sweep runs
//   THEN  a CourseAssignment with deadline = today + 30 days, a
//         COMPLIANCE_RETRAINING_DUE notice, and the matrix cell moves to DUE
//
// The cycle is per person, from their own completion. A shared company date
// would make somebody who finished last week "due" in January along with
// everybody else — which is both wrong and the reason compliance
// spreadsheets get abandoned.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { RecurringAssignment } from '../src/models/recurringAssignment.model.js'
import { Notification } from '../src/models/notification.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { complianceService, expiryFor, matchesAudience } from '../src/services/compliance/compliance.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Ishlab-chiqarish-${stamp}`
const monthsAgo = (n) => {
  const date = new Date()
  date.setMonth(date.getMonth() - n)
  return date
}

let overdue
let recent
let outsider
let course
let rule
const userIds = []

async function makeUser(name, department) {
  const user = await User.create({
    firstName: name,
    lastName: 'Compl',
    fullName: `${name} Compl`,
    jshshir: `37${userIds.length}${stamp}`,
    passwordHash: await hashPassword('ComplTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
    department,
  })
  userIds.push(user._id)
  return user
}

describe('AT-34 · recurring compliance training', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    overdue = await makeUser('Muddati', DEPT)
    recent = await makeUser('Yaqinda', DEPT)
    outsider = await makeUser('Boshqa', `Ofis-${stamp}`)

    course = await Course.create({
      title: `Yong'in xavfsizligi ${stamp}`,
      slug: `yongin-xavfsizligi-${stamp}`,
      status: 'PUBLISHED',
      createdBy: overdue._id,
    })

    // Finished thirteen months ago — a twelve-month cycle has lapsed.
    await CourseAssignment.create({
      userId: overdue._id,
      courseId: course._id,
      assignedBy: overdue._id,
      status: 'COMPLETED',
      completedAt: monthsAgo(13),
      mandatory: true,
    })
    // Finished two months ago — still valid.
    await CourseAssignment.create({
      userId: recent._id,
      courseId: course._id,
      assignedBy: overdue._id,
      status: 'COMPLETED',
      completedAt: monthsAgo(2),
      mandatory: true,
    })

    rule = await RecurringAssignment.create({
      name: `Yillik yong'in ${stamp}`,
      courseId: course._id,
      match: { departments: [DEPT] },
      intervalMonths: 12,
      dueDays: 30,
      active: true,
      createdBy: overdue._id,
    })
  })

  after(async () => {
    await Promise.all([
      CourseAssignment.deleteMany({ courseId: course._id }),
      RecurringAssignment.deleteOne({ _id: rule._id }),
      Notification.deleteMany({ userId: { $in: userIds } }),
    ])
    await Course.deleteOne({ _id: course._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the sweep', () => {
    test('reassigns the person whose year is up, and nobody else', async () => {
      const result = await complianceService.runRule(rule.toObject())
      assert.equal(result.matched, 2, 'both people in the department match the audience')
      assert.equal(result.reassigned, 1, 'only the one whose completion has expired')
    })

    test('the deadline is today plus dueDays', async () => {
      const assignment = await CourseAssignment.findOne({ userId: overdue._id, courseId: course._id }).lean()
      assert.equal(assignment.status, 'ACTIVE')
      const days = Math.round((assignment.deadline - Date.now()) / (24 * 60 * 60 * 1000))
      assert.equal(days, 30)
      // The old completion is cleared: they have to do it again, and a
      // completedAt left in place would make the matrix read VALID.
      assert.equal(assignment.completedAt, null)
    })

    test('they are told', async () => {
      const notice = await Notification.findOne({
        userId: overdue._id,
        type: 'COMPLIANCE_RETRAINING_DUE',
      }).lean()
      assert.ok(notice)
    })

    test('the recent completion is left alone', async () => {
      const assignment = await CourseAssignment.findOne({ userId: recent._id, courseId: course._id }).lean()
      assert.equal(assignment.status, 'COMPLETED')
    })

    test('somebody outside the audience is untouched', async () => {
      const assignment = await CourseAssignment.findOne({ userId: outsider._id, courseId: course._id }).lean()
      assert.equal(assignment, null)
    })

    test('nextRunAt moves forward, so the rule is picked up again tomorrow', async () => {
      const stored = await RecurringAssignment.findById(rule._id).lean()
      assert.ok(stored.lastRunAt)
      assert.ok(stored.nextRunAt > new Date())
    })

    test('a second sweep does not reassign the same person twice', async () => {
      // They are ACTIVE now — reassigning would reset their deadline and
      // look like the platform lost their progress.
      const result = await complianceService.runRule(rule.toObject())
      assert.equal(result.reassigned, 0)
    })
  })

  describe('the matrix', () => {
    test('shows a cell per rule with the date behind the state', async () => {
      const { courses, rows } = await complianceService.matrix()
      assert.ok(courses.some((entry) => entry.ruleId === String(rule._id)))

      const overdueRow = rows.find((row) => row.userId === String(overdue._id))
      const cell = overdueRow.cells.find((entry) => entry.ruleId === String(rule._id))
      // "DUE" without "since when" is a red square nobody can act on.
      assert.equal(cell.state, 'DUE')
      assert.ok(cell.deadline)
    })

    test('a valid completion reads VALID, with its expiry', async () => {
      const { rows } = await complianceService.matrix()
      const recentRow = rows.find((row) => row.userId === String(recent._id))
      const cell = recentRow.cells.find((entry) => entry.ruleId === String(rule._id))
      assert.equal(cell.state, 'VALID')
      assert.ok(cell.expiresAt > new Date())
    })

    test('somebody no rule applies to is left off entirely', async () => {
      // A hundred rows of grey squares hide the ones that matter.
      const { rows } = await complianceService.matrix()
      assert.equal(rows.find((row) => row.userId === String(outsider._id)), undefined)
    })
  })

  describe('the cycle arithmetic', () => {
    test('twelve months from a completion is when it expires', () => {
      const expiry = expiryFor(new Date('2026-03-15'), 12)
      assert.equal(expiry.toISOString().slice(0, 10), '2027-03-15')
    })

    test('a month-end date does not drift forward', () => {
      // 31 January + 1 month is 3 March by default, which would push a
      // yearly cycle forward every time it crossed a short month.
      const expiry = expiryFor(new Date('2026-01-31'), 1)
      assert.equal(expiry.getMonth(), 1, 'February, not March')
    })

    test('never completed has no expiry', () => {
      assert.equal(expiryFor(null, 12), null)
    })

    test('an unconstrained audience is everybody', () => {
      // Unlike an enrolment rule: "everybody does fire safety" is the usual
      // case for compliance.
      assert.equal(matchesAudience({ department: 'anything' }, {}), true)
    })
  })
})
