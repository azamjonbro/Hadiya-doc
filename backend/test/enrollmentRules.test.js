// 5.3 — enrolment rules.
//
// Two properties hold the feature up, and both are the kind that only fail
// in production:
//
//   idempotence  the nightly sweep re-applies every rule to everybody it
//                matches, so "already assigned" has to be a no-op. Without
//                it a rule builds a pile of assignments with a fresh
//                deadline every morning.
//
//   additive-only  a rule that stops matching somebody does not take their
//                courses away. They may be half through one, and revoking
//                training is not a decision a background job gets to make.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { EnrollmentRule } from '../src/models/enrollmentRule.model.js'
import { Group } from '../src/models/group.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { enrollmentRuleService, matchesRule } from '../src/services/enrollment/enrollmentRule.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Maintenance-${stamp}`
const OTHER_DEPT = `Sales-${stamp}`

let employeeRole
let electrician
let salesperson
let course
let secondCourse
let rule
let group
const userIds = []

async function makeUser(name, department, position = '') {
  const user = await User.create({
    firstName: name,
    lastName: 'Rule',
    fullName: `${name} Rule`,
    jshshir: `28${userIds.length}${stamp}`,
    passwordHash: await hashPassword('RuleTest123!'),
    roleId: employeeRole._id,
    department,
    position,
  })
  userIds.push(user._id)
  return user
}

describe('enrolment rules (5.3)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    electrician = await makeUser('Elektrik', DEPT, 'Electrician')
    salesperson = await makeUser('Sotuvchi', OTHER_DEPT, 'Sales')

    course = await Course.create({
      title: `Rule course ${stamp}`,
      slug: `rule-course-${stamp}`,
      status: 'PUBLISHED',
      createdBy: electrician._id,
    })
    secondCourse = await Course.create({
      title: `Rule course two ${stamp}`,
      slug: `rule-course-two-${stamp}`,
      status: 'PUBLISHED',
      createdBy: electrician._id,
    })

    group = await Group.create({
      name: `Rule group ${stamp}`,
      memberIds: [salesperson._id],
      createdBy: electrician._id,
    })

    rule = await EnrollmentRule.create({
      name: `Maintenance safety ${stamp}`,
      active: true,
      match: { departments: [DEPT] },
      grant: { courseIds: [course._id], deadlineDays: 14, mandatory: true },
      createdBy: electrician._id,
    })
  })

  after(async () => {
    await Promise.all([
      CourseAssignment.deleteMany({ userId: { $in: userIds } }),
      EnrollmentRule.deleteMany({ createdBy: electrician._id }),
      Group.deleteOne({ _id: group._id }),
      Course.deleteMany({ _id: { $in: [course._id, secondCourse._id] } }),
    ])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('matching', () => {
    test('an empty match is refused rather than applying to everybody', () => {
      // Occasionally what somebody wants, never what they want by accident.
      assert.equal(matchesRule({ department: DEPT }, { match: {} }), false)
    })

    test('fields combine with AND, values within a field with OR', () => {
      const twoField = { match: { departments: [DEPT], positions: ['Electrician', 'Technician'] } }
      assert.equal(matchesRule({ department: DEPT, position: 'Technician' }, twoField), true)
      // Right department, wrong job.
      assert.equal(matchesRule({ department: DEPT, position: 'Driver' }, twoField), false)
      // Right job, wrong department.
      assert.equal(matchesRule({ department: OTHER_DEPT, position: 'Electrician' }, twoField), false)
    })

    test('group membership is matched from the resolved member set', () => {
      const byGroup = { match: { groups: [group._id] } }
      const members = new Set([String(salesperson._id)])
      assert.equal(matchesRule({ _id: salesperson._id }, byGroup, { groupMemberIds: members }), true)
      assert.equal(matchesRule({ _id: electrician._id }, byGroup, { groupMemberIds: members }), false)
    })
  })

  describe('applying', () => {
    test('assigns the granted course to everyone who matches, and nobody else', async () => {
      const result = await enrollmentRuleService.applyRule(rule.toObject())
      assert.equal(result.matched, 1)
      assert.equal(result.courses, 1)

      const assigned = await CourseAssignment.findOne({ userId: electrician._id, courseId: course._id }).lean()
      assert.ok(assigned)
      assert.equal(assigned.mandatory, true)
      assert.ok(assigned.deadline, 'deadlineDays has to become an actual date')

      const notAssigned = await CourseAssignment.findOne({ userId: salesperson._id, courseId: course._id }).lean()
      assert.equal(notAssigned, null)
    })

    test('running it again assigns nothing and moves no deadline', async () => {
      const before = await CourseAssignment.findOne({ userId: electrician._id, courseId: course._id }).lean()
      const result = await enrollmentRuleService.applyRule(rule.toObject())
      assert.equal(result.courses, 0, 'the sweep runs nightly — a second pass must be a no-op')

      const after = await CourseAssignment.findOne({ userId: electrician._id, courseId: course._id }).lean()
      assert.equal(after.deadline.getTime(), before.deadline.getTime(), 'a re-run must not push the due date forward')
      const count = await CourseAssignment.countDocuments({ userId: electrician._id, courseId: course._id })
      assert.equal(count, 1)
    })

    test('records when it last ran and how many it matched', async () => {
      const stored = await EnrollmentRule.findById(rule._id).lean()
      assert.ok(stored.lastEvaluatedAt)
      assert.equal(stored.lastMatchedCount, 1)
    })

    test('adding a course to the rule grants only the new one', async () => {
      await EnrollmentRule.updateOne(
        { _id: rule._id },
        { $set: { 'grant.courseIds': [course._id, secondCourse._id] } }
      )
      const updated = await EnrollmentRule.findById(rule._id).lean()
      const result = await enrollmentRuleService.applyRule(updated)
      assert.equal(result.courses, 1)
    })

    test('somebody who stops matching keeps what they were given', async () => {
      // They may be half through it. Revoking training is a deliberate,
      // audited act, not something a nightly job decides.
      await User.updateOne({ _id: electrician._id }, { $set: { department: OTHER_DEPT } })
      const updated = await EnrollmentRule.findById(rule._id).lean()
      const result = await enrollmentRuleService.applyRule(updated)
      assert.equal(result.matched, 0)

      const still = await CourseAssignment.countDocuments({ userId: electrician._id, courseId: course._id })
      assert.equal(still, 1)

      await User.updateOne({ _id: electrician._id }, { $set: { department: DEPT } })
    })

    test('an inactive rule is skipped by the sweep', async () => {
      await EnrollmentRule.updateOne({ _id: rule._id }, { $set: { active: false } })
      const totals = await enrollmentRuleService.applyAll()
      assert.equal(totals.rules, 0)
      await EnrollmentRule.updateOne({ _id: rule._id }, { $set: { active: true } })
    })
  })

  describe('preview', () => {
    test('reports who would be caught, without assigning anything', async () => {
      const draft = {
        match: { departments: [DEPT, OTHER_DEPT] },
        grant: { courseIds: [secondCourse._id] },
      }
      const before = await CourseAssignment.countDocuments({ userId: salesperson._id })
      const preview = await enrollmentRuleService.preview(draft)

      assert.equal(preview.matchedCount, 2)
      assert.ok(preview.sample.length <= 10, 'four hundred names is not a preview')
      assert.equal(await CourseAssignment.countDocuments({ userId: salesperson._id }), before)
    })
  })
})
