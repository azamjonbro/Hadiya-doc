// 14.4 — AT-18 … AT-21, the manager fence.
//
// Four acceptance tests, one question: can somebody who is scoped to a
// department reach data outside it? The four ways they might try are the
// four ways the platform hands employee data out — one profile, a report
// export, the dashboard, and the plain user list.
//
// This file drives the services rather than HTTP on purpose. `roleScope.test.js`
// already covers the wire for AT-21 and needs a server on :4000 to do it;
// these run against Mongo alone, so the fence is checked even when nothing
// is listening. The one exception is AT-20, where the refusal lives in the
// controller and nowhere else, so the controller is what is called.
//
// Everything is built from a fresh department name per run, so the counts
// are exact rather than "at least": an off-by-one leak is only visible if
// the expected number is a number.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { ROLE_SCOPES, PERMISSIONS } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import {
  scopedUserIdsFor,
  hasUnscopedAccess,
  assertWithinScope,
  assertDepartmentWithinScope,
} from '../src/services/access/actorScope.js'
import { scopeToManagedUsers } from '../src/middlewares/scopeToManagedUsers.middleware.js'
import { employeeInsightsService } from '../src/services/analytics/employeeInsights.service.js'
import { userService } from '../src/services/users/user.service.js'
import { reportDataService } from '../src/services/reports/reportData.service.js'
import { dashboardController } from '../src/controllers/dashboard.controller.js'
import { computeTeamDashboard } from '../src/analytics/teamDashboard.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0

// "Sotuv" and "Marketing", exactly as the acceptance tests name them, with a
// per-run suffix so two runs in parallel cannot see each other's people.
const SOTUV = `Sotuv-${stamp}`
const MARKETING = `Marketing-${stamp}`

let employeeRole
let managerRole
let supervisorRole
let auditorRole

let manager
let supervisor
let sotuvStaff = []
let marketingStaff = []
const createdUserIds = []
const createdRoleIds = []

let managerActor
let supervisorActor
let auditorActor

async function makeUser(name, department, roleId) {
  const user = await User.create({
    firstName: name,
    lastName: 'Scope',
    fullName: `${name} Scope`,
    jshshir: `44${seq++}${stamp}`,
    passwordHash: await hashPassword('ScopeGridTest123!'),
    roleId,
    department,
  })
  createdUserIds.push(user._id)
  return user
}

const actorFor = (user, role) => ({
  id: user._id.toString(),
  roleId: role._id.toString(),
  roleName: role.name,
  permissions: role.permissions,
  scope: role.scope,
})

/** Everyone this run put in Sotuv, which is the whole of the fence. */
const sotuvIds = () => [manager, supervisor, ...sotuvStaff].map((user) => user._id.toString())

/** Runs the real middleware against a stub request, the way Express would. */
function runScopeMiddleware(actor) {
  const req = { user: actor }
  return new Promise((resolve, reject) => {
    scopeToManagedUsers(req, {}, (error) => (error ? reject(error) : resolve(req)))
  })
}

/** Calls a controller and hands back whatever it produced — a body or an error. */
function callController(handler, actor) {
  return new Promise((resolve) => {
    const req = { user: actor, headers: {}, ip: '127.0.0.1' }
    const res = { status: () => res, json: (body) => resolve({ body }) }
    handler(req, res, (error) => resolve({ error }))
  })
}

describe('manager scope · AT-18 … AT-21 (14.4)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    managerRole = await Role.findOne({ name: 'MANAGER' })
    assert.ok(employeeRole && managerRole, 'roles are missing — boot the server against this database once')
    // The fence must come from the role's own scope, not from its name.
    assert.equal(managerRole.scope, ROLE_SCOPES.DEPARTMENT, 'MANAGER is expected to be department-scoped')

    // AT-21's role: created through the API's own model with user:read and a
    // department scope, and named nothing the code could recognise.
    supervisorRole = await Role.create({
      name: `SUPERVISOR_${stamp}`,
      permissions: [PERMISSIONS.USER_READ, PERMISSIONS.ANALYTICS_VIEW_ALL],
      scope: ROLE_SCOPES.DEPARTMENT,
    })
    // The control: same permissions, no fence. If this one is also narrowed,
    // the test below would pass for the wrong reason.
    auditorRole = await Role.create({
      name: `AUDITOR_${stamp}`,
      permissions: [PERMISSIONS.USER_READ, PERMISSIONS.ANALYTICS_VIEW_ALL],
      scope: ROLE_SCOPES.ALL,
    })
    createdRoleIds.push(supervisorRole._id, auditorRole._id)

    manager = await makeUser('Rahbar', SOTUV, managerRole._id)
    supervisor = await makeUser('Nazoratchi', SOTUV, supervisorRole._id)
    sotuvStaff = []
    for (let i = 0; i < 5; i += 1) sotuvStaff.push(await makeUser(`Sotuvchi${i}`, SOTUV, employeeRole._id))
    marketingStaff = []
    for (let i = 0; i < 4; i += 1) marketingStaff.push(await makeUser(`Marketolog${i}`, MARKETING, employeeRole._id))

    managerActor = actorFor(manager, managerRole)
    supervisorActor = actorFor(supervisor, supervisorRole)
    auditorActor = actorFor(supervisor, auditorRole)
  })

  after(async () => {
    await User.deleteMany({ _id: { $in: createdUserIds } })
    await Role.deleteMany({ _id: { $in: createdRoleIds } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('AT-18 · another department\'s employee', () => {
    // BERILGAN: a MANAGER in Sotuv, the target in Marketing.
    // HARAKAT: GET /users/:targetId/performance.
    test('AT-18 · a manager asking for an outsider\'s performance is refused with 403', async () => {
      const target = marketingStaff[0]._id.toString()
      await assert.rejects(
        () => employeeInsightsService.getPerformance(managerActor, target),
        (error) => {
          assert.equal(error.statusCode, 403)
          assert.equal(error.code, 'DEPARTMENT_SCOPE_FORBIDDEN')
          return true
        }
      )
    })

    test('AT-18 · no data comes back with the refusal', async () => {
      // A 403 that still carries a body is the leak the status code was
      // supposed to prevent. `rejects` proves there is no return value at
      // all, and this pins the sibling endpoints to the same answer.
      const target = marketingStaff[1]._id.toString()
      for (const call of [
        () => employeeInsightsService.getPerformance(managerActor, target),
        () => employeeInsightsService.getTestResults(managerActor, target),
        () => employeeInsightsService.getTasks(managerActor, target),
      ]) {
        await assert.rejects(call, (error) => error.code === 'DEPARTMENT_SCOPE_FORBIDDEN')
      }
    })

    test('AT-18 · the same manager can read their own department, so the fence is a fence and not a wall', async () => {
      // Without this, a service that threw for everybody would pass the test
      // above and break the product.
      const own = await employeeInsightsService.getPerformance(managerActor, sotuvStaff[0]._id.toString())
      assert.ok(own, 'a manager must still be able to open their own team')
    })

    test(
      'AT-18 · the refusal is written to auditLogs as ACCESS_DENIED',
      // Not implemented anywhere: `grep -rn "'ACCESS_DENIED'" backend/src`
      // finds nothing, and the throw in actorScope/user.service records no
      // audit row. The 403 half of AT-18 passes; this half does not exist
      // yet, so the case is left standing as a todo rather than deleted —
      // the KUTILGAN text asks for both.
      { todo: 'AT-18 asks for an ACCESS_DENIED audit row; nothing records one (see report)' },
      async () => {
        const { AuditLog } = await import('../src/models/auditLog.model.js')
        const before = await AuditLog.countDocuments({ actor: manager._id, action: 'ACCESS_DENIED' })
        await employeeInsightsService
          .getPerformance(managerActor, marketingStaff[2]._id.toString())
          .catch(() => {})
        const after = await AuditLog.countDocuments({ actor: manager._id, action: 'ACCESS_DENIED' })
        assert.equal(after, before + 1)
      }
    )
  })

  describe('AT-19 · a report export is fenced to the department', () => {
    // BERILGAN: a MANAGER in Sotuv; the company is larger than Sotuv.
    // HARAKAT: the employee-progress export.
    test('AT-19 · the export holds exactly the department, not the company', async () => {
      const report = await reportDataService.build(managerActor, 'employee-progress', {})
      const names = report.rows.map((row) => row.fullName)

      for (const person of [manager, supervisor, ...sotuvStaff]) {
        assert.ok(names.includes(person.fullName), `${person.fullName} is missing from their own manager's export`)
      }
      for (const person of marketingStaff) {
        assert.ok(!names.includes(person.fullName), `${person.fullName} leaked into another department's export`)
      }
      // Exactly, not "at least": the fence is a count, and a leak of one row
      // is the same bug as a leak of five hundred.
      assert.equal(report.rows.length, sotuvIds().length)
    })

    test('AT-19 · totalRows counts the fenced population, so the file cannot claim more than it may show', async () => {
      // AT-22 made the report say how many rows exist. If that number were
      // computed before the fence, it would tell a manager the size of the
      // company they are not allowed to see.
      const report = await reportDataService.build(managerActor, 'employee-progress', {})
      assert.equal(report.totalRows, sotuvIds().length)
      assert.equal(report.exportedRows, sotuvIds().length)
      assert.equal(report.truncated, false)
    })

    test('AT-19 · an unfenced actor really does see more, so the fence is what is doing the work', async () => {
      const wide = await reportDataService.build(auditorActor, 'employee-progress', {})
      const names = wide.rows.map((row) => row.fullName)
      // Only asserted against this run's own people: the database holds
      // whatever else has been created, and the claim is about the fence.
      assert.ok(names.includes(marketingStaff[0].fullName), 'an ALL-scoped actor should see other departments')
      assert.ok(wide.rows.length > sotuvIds().length)
    })

    test('AT-19 · the fence survives the middleware handing its own list over', async () => {
      // The report accepts a precomputed list from scopeToManagedUsers. If
      // that path skipped the intersection, every request through a route
      // *with* the middleware would be wider than one without it.
      const req = await runScopeMiddleware(managerActor)
      const report = await reportDataService.build(managerActor, 'employee-progress', {}, undefined, {
        scopedUserIds: req.scopedUserIds,
      })
      assert.equal(report.rows.length, sotuvIds().length)
    })
  })

  describe('AT-20 · the dashboard is fenced', () => {
    test('AT-20 · a scoped manager is not handed the company-wide dashboard', async () => {
      // The cached payload is aggregated over every employee with no notion
      // of who will read it, so handing it to a manager would undo the fence
      // the rest of their session runs behind.
      const { error } = await callController(dashboardController.get, managerActor)
      assert.ok(error, 'the company dashboard must not answer a scoped caller')
      assert.equal(error.statusCode, 403)
      assert.equal(error.code, 'DASHBOARD_SCOPE_FORBIDDEN')
    })

    test('AT-20 · totalEmployees on the manager\'s own dashboard is their department only', async () => {
      const req = await runScopeMiddleware(managerActor)
      const dashboard = await computeTeamDashboard(req.scopedUserIds)
      assert.equal(dashboard.cards.teamSize, sotuvIds().length)
    })

    test('AT-20 · employeeProgress lists only the manager\'s own people', async () => {
      const dashboard = await computeTeamDashboard(await scopedUserIdsFor(managerActor))
      const names = dashboard.members.map((member) => member.fullName)
      assert.equal(names.length, sotuvIds().length)
      for (const person of marketingStaff) {
        assert.ok(!names.includes(person.fullName), `${person.fullName} appeared on another department's dashboard`)
      }
    })

    test('AT-20 · an unfenced actor asking for "my team" gets everyone, which is their scope', async () => {
      // Availability must not depend on the role name — that coupling is
      // what 2.2 removed. An admin's team is the company.
      assert.equal(hasUnscopedAccess(auditorActor), true)
      assert.equal(await scopedUserIdsFor(auditorActor), null)
    })
  })

  describe('AT-21 · a custom role is scoped too', () => {
    // BERILGAN: a role created with user:read and scope DEPARTMENT.
    // HARAKAT: that user calls GET /users.
    test('AT-21 · the role carries its own scope, and nothing reads its name', async () => {
      const stored = await Role.findById(supervisorRole._id).lean()
      assert.equal(stored.scope, ROLE_SCOPES.DEPARTMENT)
      assert.equal(hasUnscopedAccess(supervisorActor), false)
    })

    test('AT-21 · scopedUserIdsFor returns exactly the actor\'s own department', async () => {
      const allowed = await scopedUserIdsFor(supervisorActor)
      assert.deepEqual([...allowed].sort(), [...sotuvIds()].sort())
    })

    test('AT-21 · GET /users returns only that department', async () => {
      const page = await userService.list(supervisorActor, { page: 1, limit: 100 })
      const names = page.items.map((row) => row.fullName)
      assert.equal(page.total, sotuvIds().length)
      for (const person of marketingStaff) {
        assert.ok(!names.includes(person.fullName), 'a department-scoped custom role read another department')
      }
    })

    test('AT-21 · a department filter cannot be used to step outside the fence', async () => {
      // The obvious way round it: ask for the other department by name. The
      // scoped actor's own department overwrites the query, so the answer is
      // their own people rather than an error the UI would then work around.
      const page = await userService.list(supervisorActor, { page: 1, limit: 100, department: MARKETING })
      const names = page.items.map((row) => row.fullName)
      for (const person of marketingStaff) {
        assert.ok(!names.includes(person.fullName), 'the department filter defeated the fence')
      }
      assert.equal(page.total, sotuvIds().length)
    })

    test('AT-21 · the department picker offers only the one they are fenced to', async () => {
      // A list of every department name is itself company data, and it is
      // the list the filter above is chosen from.
      assert.deepEqual(await userService.listDepartments(supervisorActor), [SOTUV])
    })

    test('AT-21 · the same permissions with scope ALL do see everyone', async () => {
      const page = await userService.list(auditorActor, { page: 1, limit: 100, department: MARKETING })
      const names = page.items.map((row) => row.fullName)
      assert.ok(names.includes(marketingStaff[0].fullName), 'scope, not permission, is what decides')
    })

    test('AT-21 · one target at a time is fenced the same way as a list', async () => {
      // The list and the single-target check are separate code paths, and a
      // fence on only one of them is a fence on neither.
      await assert.doesNotReject(() => assertWithinScope(supervisorActor, sotuvStaff[0]._id.toString()))
      await assert.rejects(
        () => assertWithinScope(supervisorActor, marketingStaff[0]._id.toString()),
        (error) => error.statusCode === 403
      )
      await assert.doesNotReject(() => assertDepartmentWithinScope(supervisorActor, SOTUV))
      await assert.rejects(
        () => assertDepartmentWithinScope(supervisorActor, MARKETING),
        (error) => error.code === 'DEPARTMENT_SCOPE_FORBIDDEN'
      )
    })

    test('AT-21 · the middleware puts the same fenced list on the request', async () => {
      // A route that forgets to apply req.scopedUserIds is visible; a
      // middleware that computes the wrong list is not, so it is checked
      // against the service that computes the truth.
      const req = await runScopeMiddleware(supervisorActor)
      assert.deepEqual([...req.scopedUserIds].sort(), [...sotuvIds()].sort())

      const unfenced = await runScopeMiddleware(auditorActor)
      assert.equal(unfenced.scopedUserIds, null, 'null means no fence, and only ALL may have it')
    })

    test('AT-21 · a scoped role with nothing to be scoped to is fenced to nobody, not to everybody', async () => {
      // Failing closed. A department-scoped account with no department set —
      // an import that dropped a column — must not become an admin.
      const orphan = await makeUser('Bo\'limsiz', '', supervisorRole._id)
      const allowed = await scopedUserIdsFor(actorFor(orphan, supervisorRole))
      assert.deepEqual(allowed, [])
    })
  })
})
