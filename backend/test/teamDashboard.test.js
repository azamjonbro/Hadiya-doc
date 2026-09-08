// 2.5 — the dashboard a scoped person gets, and the acceptance behind it:
// what a MANAGER sees in the UI is what they can get from the API.
//
// The two used to disagree in both directions. /bos was SUPERADMIN-only, so
// a manager could call the endpoints but not open the pages that call them;
// and the company dashboard answered 403 to anyone scoped, with nothing to
// send them to. This closes the 0.3 deviation, which said in as many words
// that the team-scoped dashboard would be built here.
//
// The population is the point: a manager's figures must cover their reports
// and nobody else's, whichever direction the mistake would go.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { ROLE_SCOPES, PERMISSIONS } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { env } from '../src/config/env.js'
import { computeTeamDashboard } from '../src/analytics/teamDashboard.js'
import { orgHierarchyService } from '../src/services/org/orgHierarchy.service.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const stamp = String(Date.now()).slice(-11)
let seq = 0

let managerRole
let employeeRole
let manager
let reportA
let reportB
let outsider
let course
let course2
const created = []

async function makeUser(name, roleId, managerId = null) {
  const user = await User.create({
    firstName: name,
    lastName: 'Team',
    fullName: `${name} Team`,
    jshshir: `11${seq++}${stamp}`,
    passwordHash: await hashPassword('TeamTest123!'),
    roleId,
    managerId,
    department: 'TeamTest',
  })
  created.push(user._id)
  return user
}

function tokenFor(user, role, scope) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      roleId: role._id.toString(),
      roleName: role.name,
      permissions: role.permissions,
      scope,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  )
}

async function api(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

describe('the team dashboard', () => {
  before(async () => {
    await connectDatabase()
    managerRole = await Role.findOne({ name: 'MANAGER' })
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(managerRole && employeeRole, 'roles are missing — boot the server against this database once')

    manager = await makeUser('Manager', managerRole._id)
    reportA = await makeUser('ReportA', employeeRole._id, manager._id)
    reportB = await makeUser('ReportB', employeeRole._id, manager._id)
    // Same department, different manager: department and reporting line are
    // separate axes, and TEAM scope follows the line.
    outsider = await makeUser('Outsider', employeeRole._id)

    // Two courses, because an employee can hold only one assignment per
    // course (unique userId+courseId) and reportA needs both a completed one
    // and an overdue one.
    course = await Course.create({
      title: `Team test course ${stamp}`,
      description: 'x',
      slug: `team-test-${stamp}`,
      status: 'PUBLISHED',
      createdBy: manager._id,
    })
    course2 = await Course.create({
      title: `Team test course 2 ${stamp}`,
      description: 'x',
      slug: `team-test-2-${stamp}`,
      status: 'PUBLISHED',
      createdBy: manager._id,
    })

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await CourseAssignment.insertMany([
      { userId: reportA._id, courseId: course._id, status: 'COMPLETED', assignedBy: manager._id },
      { userId: reportA._id, courseId: course2._id, status: 'ACTIVE', deadline: yesterday, assignedBy: manager._id },
      { userId: reportB._id, courseId: course._id, status: 'ACTIVE', deadline: nextWeek, assignedBy: manager._id },
      // The outsider's row must never show up in the manager's figures.
      { userId: outsider._id, courseId: course._id, status: 'ACTIVE', deadline: yesterday, assignedBy: manager._id },
    ])

    await orgHierarchyService.invalidateFor(manager._id)
  })

  after(async () => {
    const ids = created.filter(Boolean)
    const courseIds = [course?._id, course2?._id].filter(Boolean)
    await CourseAssignment.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: ids } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('covers the reports and nobody else', async () => {
    const ids = [manager._id, reportA._id, reportB._id].map(String)
    const data = await computeTeamDashboard(ids)
    assert.equal(data.cards.teamSize, 3)
    assert.equal(data.cards.coursesAssigned, 3, 'the outsider\'s assignment was counted')
    assert.equal(data.cards.coursesCompleted, 1)
    assert.equal(data.cards.overdue, 1, 'only the report\'s overdue row should count')
  })

  test('members are listed worst-first — the question a manager opens this to answer', async () => {
    const data = await computeTeamDashboard([manager._id, reportA._id, reportB._id].map(String))
    const completions = data.members.map((member) => member.avgCompletion)
    assert.deepEqual(completions, [...completions].sort((a, b) => a - b))
  })

  test('someone who has never watched anything reads as never, not as zero-long-ago', async () => {
    const data = await computeTeamDashboard([reportB._id].map(String))
    assert.equal(data.members[0].lastActivityAt, null)
  })

  test('upcoming deadlines exclude ones already passed', async () => {
    const data = await computeTeamDashboard([reportA._id, reportB._id].map(String))
    assert.equal(data.upcomingDeadlines.length, 1, 'an overdue row leaked into "upcoming"')
    assert.equal(data.upcomingDeadlines[0].fullName, 'ReportB Team')
  })

  test('a manager with nobody under them gets a shaped, empty answer', async () => {
    // A real state during an org import. A 404 or a null would make the page
    // look broken instead of empty.
    const data = await computeTeamDashboard([])
    assert.equal(data.cards.teamSize, 0)
    assert.deepEqual(data.members, [])
    assert.deepEqual(data.upcomingDeadlines, [])
  })

  describe('over HTTP', () => {
    test('a scoped caller is refused the company dashboard and told where to go', async () => {
      const { status, body } = await api('/dashboard', tokenFor(manager, managerRole, ROLE_SCOPES.DEPARTMENT))
      assert.equal(status, 403)
      assert.equal(body.code, 'DASHBOARD_SCOPE_FORBIDDEN')
      assert.match(body.message, /\/dashboard\/team/, 'the refusal should say what to call instead')
    })

    test('the same caller gets the team dashboard', async () => {
      const { status, body } = await api('/dashboard/team', tokenFor(manager, managerRole, ROLE_SCOPES.TEAM))
      assert.equal(status, 200)
      assert.equal(body.data.cards.teamSize, 3, 'expected the manager and their two reports')
      const names = body.data.members.map((member) => member.fullName)
      assert.ok(!names.includes('Outsider Team'), 'someone outside the reporting line appeared')
    })

    test('an unscoped caller may ask the same question and gets the whole company', async () => {
      // Refusing an admin "my team" would put the endpoint's availability
      // back on the role, which is the coupling 2.2 removed.
      const { status, body } = await api('/dashboard/team', tokenFor(manager, managerRole, ROLE_SCOPES.ALL))
      assert.equal(status, 200)
      assert.ok(body.data.cards.teamSize > 3)
    })

    test('the endpoint still needs analytics:view:all — scope is not a substitute for permission', async () => {
      // role.scope says *how many* people; the permission says whether they
      // may see figures about other people at all.
      const { status } = await api('/dashboard/team', tokenFor(reportA, employeeRole, ROLE_SCOPES.SELF))
      assert.equal(status, 403)
      assert.ok(!employeeRole.permissions.includes(PERMISSIONS.ANALYTICS_VIEW_ALL))
    })

    test('/users/me reports the scope, which is what the SPA routes on', async () => {
      const { body } = await api('/users/me', tokenFor(manager, managerRole, ROLE_SCOPES.DEPARTMENT))
      assert.equal(body.data.scope, ROLE_SCOPES.DEPARTMENT)
    })
  })
})
