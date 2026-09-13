// The live half of the admin home (rasm 1): the operational counts and
// lists, computed per call. What is checked is shape and the one derived
// fact each block carries — "filled fields", "assigned to me", "created
// this week" — against rows this test creates and removes.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { PERMISSIONS } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { CourseQuestion } from '../src/models/courseQuestion.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { computeDashboardInbox } from '../src/analytics/dashboardInbox.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-11)
let role
let author
let hire
let course
let question

before(async () => {
  await connectDatabase()
  role = await Role.findOne({ name: 'EMPLOYEE' })
  const password = await hashPassword('Secret123!')
  author = await User.create({ fullName: `Inbox Author ${stamp}`, jshshir: `1${stamp}00`, passwordHash: password, roleId: role._id, isActive: true })
  // Half a profile: email, phone and position filled, branch/department/avatar not.
  hire = await User.create({
    fullName: `Inbox Hire ${stamp}`,
    jshshir: `1${stamp}01`,
    passwordHash: password,
    roleId: role._id,
    isActive: true,
    email: `inbox-${stamp}@example.com`,
    phone: '+998900000000',
    position: 'Analyst',
  })
  course = await Course.create({ title: `Inbox course ${stamp}`, slug: `inbox-course-${stamp}`, status: 'DRAFT', createdBy: author._id, authorIds: [author._id] })
  question = await CourseQuestion.create({ courseId: course._id, userId: hire._id, question: 'Where is lesson two?' })
})

after(async () => {
  if (question) await CourseQuestion.deleteOne({ _id: question._id })
  if (course) await Course.deleteOne({ _id: course._id })
  await User.deleteMany({ _id: { $in: [author?._id, hire?._id].filter(Boolean) } })
  await mongoose.disconnect()
  await redisConnection.quit()
})

describe('dashboard inbox', () => {
  test('counts the unanswered question and lists the week\'s course with its author', async () => {
    const inbox = await computeDashboardInbox({ id: String(author._id), permissions: [] })
    assert.ok(inbox.questions.unanswered >= 1)
    const row = inbox.newCourses.find((c) => c.id === String(course._id))
    assert.ok(row, 'the course created just now is this week\'s material')
    assert.deepEqual(row.authors, [author.fullName])
    // No quiz:grade → no grading block rather than a 403 for the whole page.
    assert.equal(inbox.grading, null)
  })

  test('a new hire shows how much of the profile is filled', async () => {
    const inbox = await computeDashboardInbox({ id: String(author._id), permissions: [PERMISSIONS.QUIZ_GRADE] })
    const row = inbox.newEmployees.items.find((u) => u.id === String(hire._id))
    assert.ok(row)
    assert.equal(row.filledFields, 3)
    assert.equal(row.totalFields, 6)
    assert.equal(row.onboarding, null)
    assert.ok(inbox.newEmployees.total >= 2)
    assert.ok(Array.isArray(inbox.grading.items))
    assert.equal(typeof inbox.grading.mine, 'number')
  })
})
