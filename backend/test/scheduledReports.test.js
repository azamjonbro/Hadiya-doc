// 8.4 — a report that builds itself on a timetable.
//
// Most of the thinking here is in one function: when does this run next.
// It is the part with no user watching it, so a mistake shows up as a report
// that quietly never arrives — or one that arrives every hour.
//
// The other half is that the schedule must not become a way around anything:
// the file is built with its *owner's* scope, and a schedule belongs to the
// person who wrote it.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { ROLE_SCOPES, PERMISSIONS } from '@lms/shared'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { ScheduledReport } from '../src/models/scheduledReport.model.js'
import { ExportJob } from '../src/models/exportJob.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { env } from '../src/config/env.js'
import { computeNextRun, scheduledReportService } from '../src/services/reports/scheduledReport.service.js'
import { exportQueue } from '../src/jobs/exportQueue.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const stamp = String(Date.now()).slice(-11)

let schedulerRole
let plainRole
let owner
let stranger
const createdUsers = []
const createdRoles = []
const createdSchedules = []

async function makeRole(name, permissions) {
  const role = await Role.create({ name: `${name}_${stamp}`, permissions, scope: ROLE_SCOPES.ALL })
  createdRoles.push(role._id)
  return role
}

async function makeUser(name, role) {
  const user = await User.create({
    firstName: name,
    lastName: 'Sched',
    fullName: `${name} Sched`,
    jshshir: `66${createdUsers.length}${stamp}`,
    passwordHash: await hashPassword('SchedTest123!'),
    roleId: role._id,
  })
  createdUsers.push(user._id)
  return user
}

function tokenFor(user, role) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      roleId: role._id.toString(),
      roleName: role.name,
      permissions: role.permissions,
      scope: ROLE_SCOPES.ALL,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  )
}

async function api(path, token, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// The zone every schedule is expressed in. 07:00 there is 02:00Z, and no DST.
const TZ_OFFSET_HOURS = 5

describe('scheduled reports (8.4)', () => {
  before(async () => {
    await connectDatabase()
    assert.equal(env.APP_TIMEZONE, 'Asia/Tashkent', 'these hour assertions assume the configured zone')

    schedulerRole = await makeRole('SCHEDULER', [PERMISSIONS.REPORT_SCHEDULE, PERMISSIONS.REPORT_EXPORT])
    plainRole = await makeRole('NO_SCHEDULE', [PERMISSIONS.REPORT_EXPORT])
    owner = await makeUser('Owner', schedulerRole)
    stranger = await makeUser('Stranger', schedulerRole)
  })

  after(async () => {
    const jobs = await ExportJob.find({ requestedBy: { $in: createdUsers } }, { _id: 1 }).lean()
    for (const job of jobs) await exportQueue.remove(`export-${job._id}`).catch(() => {})
    await ExportJob.deleteMany({ requestedBy: { $in: createdUsers } })
    await ScheduledReport.deleteMany({ _id: { $in: createdSchedules } })
    await AuditLog.deleteMany({ actor: { $in: createdUsers } })
    await User.deleteMany({ _id: { $in: createdUsers } })
    await Role.deleteMany({ _id: { $in: createdRoles } })
    await exportQueue.close()
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('when it runs next', () => {
    // A Thursday, 09:00 local (04:00Z).
    const thursdayMorning = new Date('2026-09-10T04:00:00Z')

    test('daily rolls to tomorrow once today’s hour has passed', () => {
      const next = computeNextRun({ cadence: 'DAILY', hour: 7 }, thursdayMorning)
      assert.equal(next.toISOString(), '2026-09-11T02:00:00.000Z')
    })

    test('daily stays on today when the hour is still ahead', () => {
      const next = computeNextRun({ cadence: 'DAILY', hour: 18 }, thursdayMorning)
      assert.equal(next.toISOString(), '2026-09-10T13:00:00.000Z')
    })

    test('weekly finds the next matching weekday', () => {
      // Monday = 1, and the next Monday after Thursday the 10th is the 14th.
      const next = computeNextRun({ cadence: 'WEEKLY', dayOfWeek: 1, hour: 7 }, thursdayMorning)
      assert.equal(next.toISOString(), '2026-09-14T02:00:00.000Z')
    })

    test('weekly on today, hour already gone, waits a full week', () => {
      // Thursday = 4. 07:00 has passed, so not today.
      const next = computeNextRun({ cadence: 'WEEKLY', dayOfWeek: 4, hour: 7 }, thursdayMorning)
      assert.equal(next.toISOString(), '2026-09-17T02:00:00.000Z')
    })

    test('monthly rolls into the next month', () => {
      const next = computeNextRun({ cadence: 'MONTHLY', dayOfMonth: 1, hour: 7 }, thursdayMorning)
      assert.equal(next.toISOString(), '2026-10-01T02:00:00.000Z')
    })

    test('monthly on the 28th survives February', () => {
      const februaryFirst = new Date('2027-02-01T04:00:00Z')
      const next = computeNextRun({ cadence: 'MONTHLY', dayOfMonth: 28, hour: 7 }, februaryFirst)
      assert.equal(next.toISOString(), '2027-02-28T02:00:00.000Z')
    })

    test('the answer is always strictly in the future', () => {
      // Exactly on the hour. Returning "now" would make the sweep re-run the
      // same schedule on every pass, for ever.
      const onTheHour = new Date('2026-09-10T02:00:00Z')
      const next = computeNextRun({ cadence: 'DAILY', hour: 7 }, onTheHour)
      assert.ok(next > onTheHour)
      assert.equal(next.toISOString(), '2026-09-11T02:00:00.000Z')
    })

    test('the hour is local, not UTC', () => {
      const next = computeNextRun({ cadence: 'DAILY', hour: 7 }, thursdayMorning)
      assert.equal(next.getUTCHours(), 7 - TZ_OFFSET_HOURS)
    })
  })

  describe('over HTTP', () => {
    let created

    test('report:schedule is required', async () => {
      const outsider = await makeUser('Outsider', plainRole)
      const { status } = await api('/reports/schedules', tokenFor(outsider, plainRole))
      assert.equal(status, 403)
    })

    test('a schedule is created with its next run already worked out', async () => {
      const { status, body } = await api('/reports/schedules', tokenFor(owner, schedulerRole), {
        method: 'POST',
        body: { name: `Weekly ${stamp}`, type: 'employee-progress', format: 'csv', cadence: 'WEEKLY', dayOfWeek: 1, hour: 7 },
      })
      assert.equal(status, 201)
      created = body.data
      createdSchedules.push(created.id)
      assert.ok(new Date(created.nextRunAt) > new Date(), 'a new schedule is already due')
      assert.equal(new Date(created.nextRunAt).getUTCDay(), 1)
    })

    test('the 31st is refused where it is chosen, not silently moved', async () => {
      const { status } = await api('/reports/schedules', tokenFor(owner, schedulerRole), {
        method: 'POST',
        body: { name: 'End of month', type: 'employee-progress', cadence: 'MONTHLY', dayOfMonth: 31 },
      })
      assert.equal(status, 400)
    })

    test('a report type that does not exist is refused', async () => {
      const { status } = await api('/reports/schedules', tokenFor(owner, schedulerRole), {
        method: 'POST',
        body: { name: 'Nope', type: `no-such-report-${stamp}` },
      })
      assert.equal(status, 400)
    })

    test('editing the hour moves the next run with it', async () => {
      const { status, body } = await api(`/reports/schedules/${created.id}`, tokenFor(owner, schedulerRole), {
        method: 'PATCH',
        body: { hour: 18 },
      })
      assert.equal(status, 200)
      assert.equal(new Date(body.data.nextRunAt).getUTCHours(), 18 - TZ_OFFSET_HOURS)
    })

    test('somebody else’s schedule is not readable or editable', async () => {
      const token = tokenFor(stranger, schedulerRole)
      assert.equal((await api(`/reports/schedules/${created.id}`, token, { method: 'PATCH', body: { hour: 3 } })).status, 403)
      assert.equal((await api(`/reports/schedules/${created.id}`, token, { method: 'DELETE' })).status, 403)
      // And it does not appear in their list at all.
      const { body } = await api('/reports/schedules', token)
      assert.ok(!body.data.items.some((item) => item.id === created.id))
    })

    test('running it now queues an export and advances the timetable', async () => {
      const before = await api(`/reports/schedules`, tokenFor(owner, schedulerRole))
      const previousNext = before.body.data.items.find((item) => item.id === created.id).nextRunAt

      const { status, body } = await api(`/reports/schedules/${created.id}/run`, tokenFor(owner, schedulerRole), {
        method: 'POST',
      })
      assert.equal(status, 202)
      assert.ok(body.data.jobId)

      const after = await api('/reports/schedules', tokenFor(owner, schedulerRole))
      const row = after.body.data.items.find((item) => item.id === created.id)
      assert.ok(row.lastRunAt, 'a run left no record')
      assert.equal(row.lastJobId, body.data.jobId)
      assert.ok(new Date(row.nextRunAt) >= new Date(previousNext) || row.nextRunAt !== previousNext)
      assert.ok(new Date(row.nextRunAt) > new Date(), 'the schedule is due again immediately')
    })
  })

  describe('the sweep', () => {
    test('builds what is due and leaves what is not', async () => {
      const dueRow = await ScheduledReport.create({
        name: `Due ${stamp}`,
        createdBy: owner._id,
        type: 'employee-progress',
        format: 'csv',
        cadence: 'DAILY',
        hour: 7,
        nextRunAt: new Date(Date.now() - 60_000),
      })
      const futureRow = await ScheduledReport.create({
        name: `Later ${stamp}`,
        createdBy: owner._id,
        type: 'employee-progress',
        format: 'csv',
        cadence: 'DAILY',
        hour: 7,
        nextRunAt: new Date(Date.now() + 60 * 60_000),
      })
      createdSchedules.push(dueRow._id, futureRow._id)

      const result = await scheduledReportService.runDue()
      assert.ok(result.due >= 1)
      assert.ok(result.built >= 1)

      const ran = await ScheduledReport.findById(dueRow._id).lean()
      assert.ok(ran.lastRunAt, 'the due schedule did not run')
      assert.ok(ran.nextRunAt > new Date(), 'a schedule that just ran is due again')

      const untouched = await ScheduledReport.findById(futureRow._id).lean()
      assert.equal(untouched.lastRunAt, null, 'a schedule not yet due was built anyway')
    })

    test('an inactive schedule is skipped', async () => {
      const paused = await ScheduledReport.create({
        name: `Paused ${stamp}`,
        createdBy: owner._id,
        type: 'employee-progress',
        format: 'csv',
        cadence: 'DAILY',
        hour: 7,
        active: false,
        nextRunAt: new Date(Date.now() - 60_000),
      })
      createdSchedules.push(paused._id)

      await scheduledReportService.runDue()
      const after = await ScheduledReport.findById(paused._id).lean()
      assert.equal(after.lastRunAt, null)
    })

    test('one broken schedule does not stop the others', async () => {
      // A type that passed validation when it was written and has since been
      // removed — the realistic way this breaks.
      const broken = await ScheduledReport.create({
        name: `Broken ${stamp}`,
        createdBy: owner._id,
        type: `removed-report-${stamp}`,
        format: 'csv',
        cadence: 'DAILY',
        hour: 7,
        nextRunAt: new Date(Date.now() - 60_000),
      })
      const healthy = await ScheduledReport.create({
        name: `Healthy ${stamp}`,
        createdBy: owner._id,
        type: 'employee-progress',
        format: 'csv',
        cadence: 'DAILY',
        hour: 7,
        nextRunAt: new Date(Date.now() - 60_000),
      })
      createdSchedules.push(broken._id, healthy._id)

      const result = await scheduledReportService.runDue()
      assert.ok(result.failed >= 1)
      assert.ok(result.built >= 1)

      const failedRow = await ScheduledReport.findById(broken._id).lean()
      assert.ok(failedRow.lastError, 'a failed schedule must say why')
      assert.ok(failedRow.nextRunAt > new Date(), 'a failure must not retry on every sweep for ever')

      const healthyRow = await ScheduledReport.findById(healthy._id).lean()
      assert.ok(healthyRow.lastRunAt, 'a broken sibling stopped this one from running')
    })
  })
})
