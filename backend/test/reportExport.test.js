// AT-22 — an export never cuts silently.
//
//   GIVEN 8 000 employees
//   WHEN  the employee-progress report is exported
//   THEN  either all 8 000 rows (through an async job), or the response
//         says truncated: true, totalRows: 8000, exportedRows: 5000
//
// The cap was never the problem. Cutting at 5 000 and saying nothing was: a
// spreadsheet of 5 000 rows looks complete, and the 3 000 missing people
// are indistinguishable from people who do not exist.
//
// The population here is 60 with a cap of 25 rather than 8 000 with a cap
// of 5 000 — the ratio is what the assertions are about, and seeding eight
// thousand users to prove it would make this file take a minute.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { ExportJob } from '../src/models/exportJob.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { reportDataService, MAX_ROWS, ASYNC_MAX_ROWS } from '../src/services/reports/reportData.service.js'
import { exportJobService } from '../src/services/reports/exportJob.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const POPULATION = 60
const SMALL_CAP = 25

let admin
const userIds = []

const adminActor = () => ({ id: admin._id.toString(), roleName: 'SUPERADMIN', permissions: ['report:export'] })

describe('AT-22 · export truncation is never silent', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')

    const password = await hashPassword('ExportTest123!')
    const docs = []
    for (let index = 0; index < POPULATION; index += 1) {
      docs.push({
        firstName: `Export${index}`,
        lastName: 'Row',
        fullName: `Export${String(index).padStart(3, '0')} Row`,
        jshshir: `70${String(index).padStart(3, '0')}${stamp}`,
        passwordHash: password,
        roleId: role._id,
        department: `Export-${stamp}`,
      })
    }
    const created = await User.insertMany(docs)
    userIds.push(...created.map((user) => user._id))
    admin = created[0]
  })

  after(async () => {
    await ExportJob.deleteMany({ requestedBy: { $in: userIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the synchronous export', () => {
    test('says how many rows exist, and that it did not return them all', async () => {
      const result = await reportDataService.build(
        adminActor(),
        'employee-progress',
        { maxRows: SMALL_CAP },
        'en',
        { scopedUserIds: userIds }
      )

      assert.equal(result.rows.length, SMALL_CAP)
      assert.equal(result.exportedRows, SMALL_CAP)
      assert.equal(result.totalRows, POPULATION, 'the true count, not the returned count')
      assert.equal(result.truncated, true)
      assert.equal(result.maxRows, SMALL_CAP)
    })

    test('an export that fits is not flagged', async () => {
      // The flag has to mean something. Marking every export truncated
      // would be as useless as marking none.
      const result = await reportDataService.build(
        adminActor(),
        'employee-progress',
        { maxRows: POPULATION + 10 },
        'en',
        { scopedUserIds: userIds }
      )
      assert.equal(result.truncated, false)
      assert.equal(result.totalRows, POPULATION)
      assert.equal(result.exportedRows, POPULATION)
    })

    test('an empty result is not truncated either', async () => {
      const result = await reportDataService.build(adminActor(), 'employee-progress', {}, 'en', {
        scopedUserIds: [],
      })
      assert.equal(result.rows.length, 0)
      assert.equal(result.totalRows, 0)
      assert.equal(result.truncated, false)
    })

    test('the count respects the caller’s scope, not the whole database', async () => {
      // Reporting "8 000 rows exist" to somebody who may see 12 would leak
      // the size of the company through a number.
      const scoped = userIds.slice(0, 5)
      const result = await reportDataService.build(adminActor(), 'employee-progress', {}, 'en', {
        scopedUserIds: scoped,
      })
      assert.equal(result.totalRows, 5)
    })

    test('every report type reports its own totals', async () => {
      // A new builder that forgets to count would silently reintroduce the
      // bug for its own report, so the contract is checked across all of them.
      for (const type of ['employee-progress', 'course-progress', 'video-analytics', 'news-analytics', 'task-analytics']) {
        const result = await reportDataService.build(adminActor(), type, {}, 'en', { scopedUserIds: userIds })
        assert.equal(typeof result.totalRows, 'number', `${type} must report totalRows`)
        assert.equal(typeof result.truncated, 'boolean', `${type} must report truncated`)
        assert.ok(result.totalRows >= result.rows.length, `${type} totalRows cannot be below its rows`)
      }
    })
  })

  describe('the async export', () => {
    test('is queued with the scope resolved at request time', async () => {
      // If their scope widens before the worker runs, the file must not
      // quietly widen with it.
      const job = await exportJobService.create(adminActor(), {
        type: 'employee-progress',
        format: 'csv',
        lang: 'en',
        scopedUserIds: userIds.slice(0, 3),
      })
      assert.equal(job.status, 'QUEUED')
      assert.equal(job.scopedUserIds.length, 3)
      assert.ok(job.expiresAt > new Date(), 'an export is a snapshot, not a permanent file')
    })

    test('its cap is higher than the request cap, but still a cap', async () => {
      // Nobody is watching a spinner, but an unbounded export on a shared
      // box is a way to run it out of memory.
      assert.ok(ASYNC_MAX_ROWS > MAX_ROWS)
      assert.ok(Number.isFinite(ASYNC_MAX_ROWS))
    })

    test('somebody else’s export is not readable', async () => {
      const job = await exportJobService.create(adminActor(), { type: 'employee-progress' })
      // Often the staff list, filtered to what *they* were allowed to see.
      await assert.rejects(
        () => exportJobService.get({ id: new mongoose.Types.ObjectId().toString() }, job._id),
        (error) => error.statusCode === 403
      )
    })

    test('a queued job carries no download link', async () => {
      const job = await exportJobService.create(adminActor(), { type: 'employee-progress' })
      const view = await exportJobService.get(adminActor(), job._id)
      assert.equal(view.status, 'QUEUED')
      assert.equal(view.url, undefined)
    })
  })
})
