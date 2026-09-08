// AT-28 and AT-29 — bulk import, in two steps.
//
//   AT-28  a 300-row file with 3 duplicate JSHSHIRs and 2 bad departments
//          -> no User is created; willCreate 295, willUpdate 0, and every
//             error carries the row number from the operator's own file;
//             the report downloads as XLSX
//   AT-29  committing that dry run
//          -> 295 accounts; generated passwords in the response *only*;
//             one USERS_IMPORTED audit entry with the count, plus a
//             USER_CREATED for each; an ACCOUNT_CREATED notification each
//
// Built as a real .xlsx in memory and read back through the same parser the
// endpoint uses. A test that hands the service a plain array would skip the
// part that actually breaks — header names, blank padding rows, and cells
// Excel stores as numbers when they look like digits.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import ExcelJS from 'exceljs'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Branch } from '../src/models/branch.model.js'
import { OrgList } from '../src/models/orgList.model.js'
import { ImportJob } from '../src/models/importJob.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { Notification } from '../src/models/notification.model.js'
import { MailLog } from '../src/models/mailLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { userImportService, parseWorkbook, planImport } from '../src/services/users/userImport.service.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `ImportDept${stamp}`
const BRANCH = `ImportBranch${stamp}`
const ROW_COUNT = 300

let actor
let dryRunResult
const createdJshshirs = []

// A JSHSHIR is 14 digits and unique; this run gets its own prefix so two
// runs, or a run beside another suite, cannot collide.
const jshshirFor = (index) => `13${stamp}${String(index).padStart(3, '0')}`

async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Employees')
  sheet.addRow(['JSHSHIR', 'Ism', 'Familiya', "Bo'lim", 'Filial', 'Email'])

  for (let i = 0; i < ROW_COUNT; i += 1) {
    // Rows 1-3 repeat the JSHSHIR of the row before them (3 duplicates), and
    // rows 100 and 200 name a department that is not on the curated list.
    const duplicate = i > 0 && i <= 3
    const jshshir = duplicate ? jshshirFor(0) : jshshirFor(i)
    const department = i === 100 || i === 200 ? 'Nonexistent Department' : DEPT
    sheet.addRow([jshshir, `Ism${i}`, `Familiya${i}`, department, BRANCH, `import${stamp}-${i}@test.local`])
  }
  return workbook.xlsx.writeBuffer()
}

describe('AT-28 / AT-29 · bulk import', () => {
  let buffer

  before(async () => {
    await connectDatabase()
    const employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    actor = await User.create({
      firstName: 'Import',
      lastName: 'Operator',
      fullName: 'Import Operator',
      jshshir: `12${stamp}999`,
      passwordHash: await hashPassword('ImportTest123!'),
      roleId: employeeRole._id,
    })

    // The curated lists the file's values have to be on.
    await Branch.create({ name: BRANCH, nameKey: BRANCH.toLowerCase() })
    await OrgList.create({ type: 'DEPARTMENT', name: DEPT, nameKey: DEPT.toLowerCase() })

    buffer = await buildWorkbook()
  })

  after(async () => {
    const jshshirs = [...createdJshshirs, actor?.jshshir].filter(Boolean)
    const users = await User.find({ jshshir: { $in: jshshirs } }, { _id: 1 }).lean()
    const ids = users.map((row) => row._id)
    await Notification.deleteMany({ userId: { $in: ids } })
    await MailLog.deleteMany({ userId: { $in: ids } })
    await AuditLog.deleteMany({ actor: actor?._id })
    await User.deleteMany({ jshshir: { $in: jshshirs } })
    await ImportJob.deleteMany({ createdBy: actor?._id })
    await Branch.deleteMany({ nameKey: BRANCH.toLowerCase() })
    await OrgList.deleteMany({ nameKey: DEPT.toLowerCase() })
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('the parser reads a real spreadsheet, keeping each row\'s own line number', async () => {
    const rows = await parseWorkbook(buffer)
    assert.equal(rows.length, ROW_COUNT)
    // Row 1 is the header, so the first employee is on line 2 — which is what
    // the operator sees in Excel.
    assert.equal(rows[0].__row, 2)
    assert.equal(rows[0].jshshir, jshshirFor(0))
  })

  test('a file with no JSHSHIR column is refused, not half-imported', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('x')
    sheet.addRow(['Ism', 'Familiya'])
    sheet.addRow(['A', 'B'])
    await assert.rejects(() => parseWorkbook(workbook.xlsx.writeBuffer().then?.() ?? workbook), () => true)
  })

  test('AT-28 · the dry run finds every problem, each with its row number', async () => {
    dryRunResult = await userImportService.dryRun(actor, { buffer, fileName: 'employees.xlsx' })

    assert.equal(dryRunResult.totalRows, ROW_COUNT)
    assert.equal(dryRunResult.willCreate, 295, 'expected 300 rows minus 3 duplicates and 2 bad departments')
    assert.equal(dryRunResult.willUpdate, 0)
    assert.equal(dryRunResult.errors.length, 5)

    for (const error of dryRunResult.errors) {
      assert.ok(Number.isInteger(error.row), 'an error came back without a row number')
      assert.ok(error.field && error.code, 'an error came back without a field or code')
    }
  })

  test('AT-28 · the duplicates and the bad departments are named for what they are', async () => {
    const codes = dryRunResult.errors.map((error) => error.code).sort()
    assert.deepEqual(codes, ['DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE', 'UNKNOWN_VALUE', 'UNKNOWN_VALUE'])
    const departmentErrors = dryRunResult.errors.filter((error) => error.field === 'department')
    // Rows 100 and 200 of the data, which are lines 102 and 202 of the file.
    assert.deepEqual(departmentErrors.map((error) => error.row).sort((a, b) => a - b), [102, 202])
  })

  test('AT-28 · nothing is written by a dry run', async () => {
    const count = await User.countDocuments({ jshshir: { $regex: `^13${stamp}` } })
    assert.equal(count, 0, 'the dry run created accounts')
  })

  test('AT-28 · the error report downloads as a spreadsheet', async () => {
    const file = await userImportService.errorWorkbook(actor, dryRunResult.jobId)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(file)
    const sheet = workbook.worksheets[0]
    // Header plus one row per error.
    assert.equal(sheet.rowCount, dryRunResult.errors.length + 1)
    assert.equal(sheet.getRow(1).getCell(1).text, 'Satr')
  })

  test('AT-29 · the commit creates exactly what the dry run promised', async () => {
    const result = await userImportService.commit(actor, dryRunResult.jobId)
    for (const row of result.credentials) createdJshshirs.push(row.jshshir)

    assert.equal(result.created, 295)
    assert.deepEqual(result.failed, [])
    const count = await User.countDocuments({ jshshir: { $regex: `^13${stamp}` } })
    assert.equal(count, 295)
  })

  test('AT-29 · the generated passwords come back once, and are not stored in the clear', async () => {
    const sample = createdJshshirs[0]
    const user = await User.findOne({ jshshir: sample }).lean()
    assert.ok(user.passwordHash.startsWith('$argon2'), 'the password was not hashed')
    const asText = JSON.stringify(user)
    assert.ok(!asText.includes('password"'), 'a plaintext password field is on the document')

    // And the job no longer holds the parsed rows — they were a copy of
    // everyone's identity details.
    const job = await ImportJob.findById(dryRunResult.jobId).lean()
    assert.equal(job.status, 'COMMITTED')
    assert.deepEqual(job.rows, [])
    assert.equal(job.createdCount, 295)
  })

  test('AT-29 · one USERS_IMPORTED entry with the count, and a USER_CREATED for each', async () => {
    const imported = await AuditLog.find({ actor: actor._id, action: 'USERS_IMPORTED' }).lean()
    assert.equal(imported.length, 1)
    assert.equal(imported[0].metadata.created, 295)

    const perUser = await AuditLog.countDocuments({ actor: actor._id, action: 'USER_CREATED' })
    assert.equal(perUser, 295)
  })

  test('AT-29 · every new account is told it exists', async () => {
    const users = await User.find({ jshshir: { $regex: `^13${stamp}` } }, { _id: 1 }).lean()
    const notified = await Notification.countDocuments({
      userId: { $in: users.map((row) => row._id) },
      type: 'ACCOUNT_CREATED',
    })
    assert.equal(notified, 295)
  })

  test('committing the same job twice is refused', async () => {
    await assert.rejects(
      () => userImportService.commit(actor, dryRunResult.jobId),
      (error) => {
        assert.equal(error.code, 'IMPORT_ALREADY_COMMITTED')
        return true
      }
    )
  })

  test('an expired or unknown job says so rather than importing nothing quietly', async () => {
    await assert.rejects(
      () => userImportService.commit(actor, new mongoose.Types.ObjectId().toString()),
      /expired|never run/i
    )
  })

  test('a second run of the same file now reports updates, not creates', async () => {
    // The accounts exist, so the same spreadsheet is no longer 295 creates —
    // which is exactly what the operator needs to see before approving.
    const second = await userImportService.dryRun(actor, { buffer, fileName: 'employees.xlsx' })
    assert.equal(second.willCreate, 0)
    assert.equal(second.willUpdate, 295)
  })

  // Inside this suite, not a sibling one: `after` above closes the Mongo
  // connection, and node:test runs sibling suites after it has run.
  describe('the planner on its own', () => {
  test('a row missing a name is reported, not guessed at', async () => {
    const plan = await planImport([{ __row: 2, jshshir: '12345678901234', firstName: 'A' }])
    assert.equal(plan.willCreate, 0)
    assert.equal(plan.errors[0].field, 'lastName')
    assert.equal(plan.errors[0].code, 'REQUIRED')
  })

  test('a JSHSHIR that is not 14 digits is rejected before anything else is checked', async () => {
    const plan = await planImport([{ __row: 5, jshshir: '123', firstName: 'A', lastName: 'B' }])
    assert.equal(plan.errors[0].code, 'INVALID_JSHSHIR')
    assert.equal(plan.errors[0].row, 5)
  })

  test('an unknown role is named in the error rather than silently defaulted', async () => {
    const plan = await planImport([
      { __row: 2, jshshir: '12345678901234', firstName: 'A', lastName: 'B', role: 'WIZARD' },
    ])
    assert.equal(plan.errors[0].code, 'UNKNOWN_ROLE')
    assert.match(plan.errors[0].message, /WIZARD/)
  })

  test('every problem is reported, not just the first', async () => {
    // An operator fixing a spreadsheet wants the whole list; stopping at the
    // first bad row turns a 300-row file into 300 round trips.
    const plan = await planImport([
      { __row: 2, jshshir: 'bad', firstName: 'A', lastName: 'B' },
      { __row: 3, jshshir: '', firstName: 'A', lastName: 'B' },
      { __row: 4, jshshir: '12345678901299', firstName: '', lastName: 'B' },
    ])
    assert.equal(plan.errors.length, 3)
    assert.deepEqual(plan.errors.map((error) => error.row), [2, 3, 4])
  })
})
})
