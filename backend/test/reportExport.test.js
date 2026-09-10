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
import {
  reportDataService,
  MAX_ROWS,
  ASYNC_MAX_ROWS,
  PREVIEW_MAX_ROWS,
} from '../src/services/reports/reportData.service.js'
import { exportJobService } from '../src/services/reports/exportJob.service.js'
import { exportQueue, queueExport } from '../src/jobs/exportQueue.js'
import { S3StorageProvider } from '../src/storage/S3StorageProvider.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const POPULATION = 60
const SMALL_CAP = 25

let admin
const userIds = []
const queuedBullJobIds = []

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
    for (const id of queuedBullJobIds) await exportQueue.remove(id).catch(() => {})
    await exportQueue.close()
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

  // 8.2 — the report on screen. The preview is a fourth cap, smaller than
  // both export caps and for a different reason: it lands in a browser table,
  // where five thousand rows is a tab that stops responding.
  describe('the on-screen preview', () => {
    test('is capped far below an export, and says so with the same numbers', async () => {
      assert.ok(PREVIEW_MAX_ROWS < MAX_ROWS, 'a preview must not fetch what an export fetches')

      const built = await reportDataService.build(
        adminActor(),
        'employee-progress',
        { maxRows: 10 },
        'en',
        { scopedUserIds: userIds }
      )

      assert.equal(built.rows.length, 10)
      assert.equal(built.totalRows, POPULATION, 'totalRows is what exists, not what came back')
      assert.ok(built.totalRows > built.rows.length)
    })

    test('a preview that fits reports no gap between the two counts', async () => {
      const built = await reportDataService.build(
        adminActor(),
        'employee-progress',
        { maxRows: PREVIEW_MAX_ROWS },
        'en',
        { scopedUserIds: userIds }
      )
      // Sixty employees, a cap of a hundred.
      assert.equal(built.rows.length, POPULATION)
      assert.equal(built.totalRows, POPULATION)
    })

    test('the preview is fenced by the same scope as the file', async () => {
      // The screen is not a way around the fence: an empty allow-list means
      // nothing, never everything.
      const built = await reportDataService.build(
        adminActor(),
        'employee-progress',
        { maxRows: PREVIEW_MAX_ROWS },
        'en',
        { scopedUserIds: [] }
      )
      assert.equal(built.rows.length, 0)
      assert.equal(built.totalRows, 0)
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

    // This suite used to stop at exportJobService.create(), which writes the
    // Mongo row and nothing else. The row was fine; the *queueing* was not,
    // and so the route that does both answered 500 on every call and no
    // export was ever built. Anything that claims a job is queued has to go
    // through the thing that queues it.
    test('the job actually reaches the queue', async () => {
      const job = await exportJobService.create(adminActor(), {
        type: 'employee-progress',
        format: 'csv',
        lang: 'en',
        scopedUserIds: null,
      })
      const queued = await queueExport(job._id)
      queuedBullJobIds.push(queued.id)

      assert.ok(queued.id, 'add() returned no job')
      assert.equal(queued.data.jobId, String(job._id))
      // BullMQ namespaces its Redis keys with colons and throws on a custom
      // id containing one. Naming the rule rather than only the symptom:
      // the next person reaching for `${prefix}:${id}` here gets a failing
      // test instead of a 500 in production.
      assert.ok(!queued.id.includes(':'), 'a BullMQ custom job id cannot contain a colon')
    })

    test('queueing the same export twice does not build it twice', async () => {
      const job = await exportJobService.create(adminActor(), {
        type: 'employee-progress',
        format: 'csv',
        lang: 'en',
        scopedUserIds: null,
      })
      const first = await queueExport(job._id)
      const second = await queueExport(job._id)
      queuedBullJobIds.push(first.id)

      // Same custom id, so the second add is a no-op rather than a second
      // full-company aggregation on a shared box.
      assert.equal(first.id, second.id)
    })

    /**
     * The build itself, with storage swapped for a stub.
     *
     * MinIO does not run on a development machine here, and without this the
     * only thing ever exercised was create() — the row — while the part that
     * turns the row into a file went untested. Stubbing the prototype rather
     * than injecting a provider keeps the service exactly as production runs
     * it; only the two calls that need a bucket are replaced.
     */
    describe('building the file', () => {
      const stored = new Map()
      let realPut
      let realSign

      before(() => {
        realPut = S3StorageProvider.prototype.putObject
        realSign = S3StorageProvider.prototype.getSignedUrl
        S3StorageProvider.prototype.putObject = async function putObject(key, body) {
          stored.set(key, body)
          return { key }
        }
        S3StorageProvider.prototype.getSignedUrl = async function getSignedUrl(key) {
          return `https://storage.test/${key}?signature=stub`
        }
      })

      after(() => {
        S3StorageProvider.prototype.putObject = realPut
        S3StorageProvider.prototype.getSignedUrl = realSign
      })

      test('a queued job becomes a stored file with a signed link', async () => {
        const actor = adminActor()
        const job = await exportJobService.create(actor, {
          type: 'employee-progress',
          format: 'csv',
          lang: 'en',
          filters: { department: `Export-${stamp}` },
          scopedUserIds: null,
        })

        await exportJobService.run(job._id)

        const finished = await exportJobService.get(actor, String(job._id))
        assert.equal(finished.status, 'READY', finished.error)
        assert.ok(finished.rowCount > 0, 'a report of sixty employees produced no rows')
        assert.equal(finished.totalRows, finished.rowCount, 'the async cap is far above sixty')
        assert.ok(finished.url?.includes('signature='), 'a ready export must come with a signed link')
        assert.ok(finished.expiresIn > 0, 'the link has to expire')

        const csv = stored.get(`exports/${job._id}.csv`)
        assert.ok(csv, 'nothing was written to storage')
        assert.ok(csv.toString('utf8').split('\n').length > 1, 'the stored file has no rows')
      })

      test('a storage failure is recorded with a reason, not a blank', async () => {
        // The real one: a down MinIO throws AggregateError [ECONNREFUSED],
        // whose `message` is the empty string. The job row was the only
        // record of the failure, and it said FAILED and nothing else.
        const broken = new AggregateError(
          [new Error('connect ECONNREFUSED 127.0.0.1:9000')],
          '' // exactly what Node produces here
        )
        const working = S3StorageProvider.prototype.putObject
        S3StorageProvider.prototype.putObject = async () => {
          throw broken
        }

        const actor = adminActor()
        const job = await exportJobService.create(actor, {
          type: 'employee-progress',
          format: 'csv',
          lang: 'en',
          scopedUserIds: null,
        })

        await assert.rejects(() => exportJobService.run(job._id))
        S3StorageProvider.prototype.putObject = working

        const failed = await exportJobService.get(actor, String(job._id))
        assert.equal(failed.status, 'FAILED')
        assert.ok(failed.error, 'a failed export must say why')
        assert.match(failed.error, /ECONNREFUSED/)
      })
    })

    test('a queued job carries no download link', async () => {
      const job = await exportJobService.create(adminActor(), { type: 'employee-progress' })
      const view = await exportJobService.get(adminActor(), job._id)
      assert.equal(view.status, 'QUEUED')
      assert.equal(view.url, undefined)
    })
  })
})
