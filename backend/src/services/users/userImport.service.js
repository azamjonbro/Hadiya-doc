import ExcelJS from 'exceljs'
import {
  GENERATED_PASSWORD_LENGTH,
  JSHSHIR_PATTERN,
  PASSPORT_SERIES_PATTERN,
  composeFullName,
  generatePassword,
  normalizeJshshir,
  normalizePassportSeries,
} from '@lms/shared'
import { User } from '../../models/user.model.js'
import { Role } from '../../models/role.model.js'
import { OrgList } from '../../models/orgList.model.js'
import { Branch } from '../../models/branch.model.js'
import { ImportJob } from '../../models/importJob.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { hashPassword } from '../../utils/hash.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

/**
 * Bulk employee import from a spreadsheet, in two steps.
 *
 * The dry run is the whole point. An HR export of three hundred people will
 * have mistakes in it — a duplicated JSHSHIR, a department spelled two ways,
 * a missing surname — and finding them one 400 at a time is not a workflow.
 * So nothing is written until the operator has seen every problem, each
 * against its **row number in their file**, which is the only coordinate
 * they can act on.
 *
 * The commit then works from the rows the dry run parsed, not from a fresh
 * upload: the operator approved a specific list, and re-parsing could
 * legitimately produce a different one if somebody added a department in
 * between.
 */

// Header names are matched case- and space-insensitively, and both English
// and Uzbek are accepted, because the file comes from HR and not from us.
const COLUMNS = {
  jshshir: ['jshshir', 'jshshr', 'pinfl', 'жшшир'],
  firstName: ['firstname', 'first name', 'ism', 'имя'],
  lastName: ['lastname', 'last name', 'familiya', 'фамилия'],
  email: ['email', 'e-mail', 'pochta'],
  phone: ['phone', 'telefon', 'телефон'],
  passportSeries: ['passport', 'passportseries', 'passport series', 'passport seriya'],
  employeeNumber: ['employeenumber', 'employee number', 'tabel', 'tabel raqami'],
  role: ['role', 'rol', 'lavozim roli', 'роль'],
  branch: ['branch', 'filial', 'филиал'],
  department: ['department', "bo'lim", 'bolim', 'отдел'],
  subdivision: ['subdivision', "bo'linma", 'bolinma'],
  position: ['position', 'lavozim', 'должность'],
  managerJshshir: ['manager', 'managerjshshir', 'manager jshshir', 'rahbar', 'rahbar jshshir'],
}

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

function mapHeaders(headerRow) {
  const byIndex = {}
  headerRow.forEach((value, index) => {
    const header = normalizeHeader(value)
    for (const [field, aliases] of Object.entries(COLUMNS)) {
      if (aliases.includes(header) || aliases.includes(header.replace(/\s+/g, ''))) {
        byIndex[index] = field
        return
      }
    }
  })
  return byIndex
}

/** Reads the first worksheet into plain objects, keeping each row's real line number. */
export async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw ApiError.badRequest('The file has no worksheet', 'IMPORT_EMPTY')

  const headerValues = []
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headerValues[col - 1] = cell.text ?? cell.value
  })
  const headers = mapHeaders(headerValues)
  if (!Object.values(headers).includes('jshshir')) {
    throw ApiError.badRequest(
      'The file needs a JSHSHIR column — it is what an employee is matched on',
      'IMPORT_NO_JSHSHIR'
    )
  }

  const rows = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const record = { __row: rowNumber }
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const field = headers[col - 1]
      if (!field) return
      record[field] = String(cell.text ?? '').trim()
    })
    // A row where every mapped cell is blank is spreadsheet padding, not a
    // person. Reporting it as an error would bury the real ones.
    if (Object.keys(record).some((key) => key !== '__row' && record[key])) rows.push(record)
  })
  return rows
}

/**
 * Turns parsed rows into what would be written, and a list of what cannot be.
 *
 * Every problem is reported rather than the first one: an operator fixing a
 * spreadsheet wants the whole list, and stopping at the first bad row turns
 * a 300-row file into 300 round trips.
 */
export async function planImport(rows, { defaultRoleName = 'EMPLOYEE' } = {}) {
  const [roles, branches, orgLists, existingUsers] = await Promise.all([
    Role.find({}, { name: 1 }).lean(),
    Branch.find({}, { name: 1, nameKey: 1 }).lean(),
    OrgList.find({}, { type: 1, name: 1, nameKey: 1 }).lean(),
    User.find({}, { jshshir: 1, email: 1, passportSeries: 1, employeeNumber: 1 }).lean(),
  ])

  const roleByName = new Map(roles.map((role) => [role.name.toUpperCase(), role]))
  const branchKeys = new Set(branches.map((row) => row.nameKey))
  const listKeys = new Map()
  for (const row of orgLists) {
    if (!listKeys.has(row.type)) listKeys.set(row.type, new Set())
    listKeys.get(row.type).add(row.nameKey)
  }
  const existingByJshshir = new Map(existingUsers.map((user) => [user.jshshir, user]))

  // Owner-keyed, not a bare set of taken values. Re-importing the same file
  // is the normal way to update people, and a set would flag every row's own
  // email as a clash with itself — turning a routine re-import into 295
  // errors. The value is only taken if somebody *else* holds it.
  const emailOwner = new Map(existingUsers.filter((u) => u.email).map((u) => [u.email, u.jshshir]))
  const passportOwner = new Map(
    existingUsers.filter((u) => u.passportSeries).map((u) => [u.passportSeries, u.jshshir])
  )

  const errors = []
  const planned = []
  // Duplicates *within the file* are as common as clashes with the database
  // and produce a much more confusing failure at write time, so they are
  // caught here too.
  const seenJshshir = new Map()
  const seenEmail = new Map()

  const fail = (row, field, code, message) => errors.push({ row: row.__row, field, code, message })

  for (const row of rows) {
    const jshshir = normalizeJshshir(row.jshshir ?? '')
    if (!jshshir) {
      fail(row, 'jshshir', 'REQUIRED', 'JSHSHIR is required')
      continue
    }
    if (!JSHSHIR_PATTERN.test(jshshir)) {
      fail(row, 'jshshir', 'INVALID_JSHSHIR', 'JSHSHIR must be exactly 14 digits')
      continue
    }
    if (seenJshshir.has(jshshir)) {
      fail(row, 'jshshir', 'DUPLICATE_IN_FILE', `Also on row ${seenJshshir.get(jshshir)}`)
      continue
    }
    seenJshshir.set(jshshir, row.__row)

    const firstName = (row.firstName ?? '').trim()
    const lastName = (row.lastName ?? '').trim()
    if (!firstName || !lastName) {
      fail(row, firstName ? 'lastName' : 'firstName', 'REQUIRED', 'First and last name are both required')
      continue
    }

    const roleName = (row.role || defaultRoleName).trim().toUpperCase()
    const role = roleByName.get(roleName)
    if (!role) {
      fail(row, 'role', 'UNKNOWN_ROLE', `No role called "${roleName}"`)
      continue
    }

    // Branch, department, subdivision and position are curated lists. A value
    // that is not on one is almost always a typo, and accepting it would
    // create a second spelling that filters the person out of their own team.
    const orgProblem = checkOrgValue(row, 'branch', branchKeys) ??
      checkOrgValue(row, 'department', listKeys.get('DEPARTMENT')) ??
      checkOrgValue(row, 'subdivision', listKeys.get('SUBDIVISION')) ??
      checkOrgValue(row, 'position', listKeys.get('POSITION'))
    if (orgProblem) {
      fail(row, orgProblem.field, 'UNKNOWN_VALUE', orgProblem.message)
      continue
    }

    const email = (row.email ?? '').trim().toLowerCase()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      fail(row, 'email', 'INVALID_EMAIL', 'Not an email address')
      continue
    }
    const emailHeldByOther = emailOwner.has(email) && emailOwner.get(email) !== jshshir
    if (email && (emailHeldByOther || seenEmail.has(email))) {
      fail(
        row,
        'email',
        'DUPLICATE_EMAIL',
        seenEmail.has(email) ? `Also on row ${seenEmail.get(email)}` : 'Already registered to someone else'
      )
      continue
    }
    if (email) seenEmail.set(email, row.__row)

    const passportSeries = row.passportSeries ? normalizePassportSeries(row.passportSeries) : ''
    if (passportSeries && !PASSPORT_SERIES_PATTERN.test(passportSeries)) {
      fail(row, 'passportSeries', 'INVALID_PASSPORT', 'Not a passport series')
      continue
    }
    if (passportSeries && passportOwner.has(passportSeries) && passportOwner.get(passportSeries) !== jshshir) {
      fail(row, 'passportSeries', 'DUPLICATE_PASSPORT', 'Already registered to someone else')
      continue
    }

    planned.push({
      row: row.__row,
      jshshir,
      firstName,
      lastName,
      fullName: composeFullName(firstName, lastName),
      email: email || undefined,
      phone: (row.phone ?? '').trim(),
      passportSeries: passportSeries || undefined,
      employeeNumber: (row.employeeNumber ?? '').trim() || undefined,
      roleId: String(role._id),
      roleName: role.name,
      branch: (row.branch ?? '').trim(),
      department: (row.department ?? '').trim(),
      subdivision: (row.subdivision ?? '').trim(),
      position: (row.position ?? '').trim(),
      managerJshshir: normalizeJshshir(row.managerJshshir ?? '') || null,
      // An account that already exists is an update, not a create. Reported
      // separately because the two have very different consequences and the
      // operator is about to approve a number.
      exists: existingByJshshir.has(jshshir),
    })
  }

  return {
    rows: planned,
    errors,
    willCreate: planned.filter((row) => !row.exists).length,
    willUpdate: planned.filter((row) => row.exists).length,
  }
}

function checkOrgValue(row, field, allowed) {
  const value = (row[field] ?? '').trim()
  if (!value) return null
  if (!allowed || !allowed.has(value.toLowerCase())) {
    return { field, message: `"${value}" is not on the ${field} list` }
  }
  return null
}

export const userImportService = {
  async dryRun(actor, { buffer, fileName }) {
    const parsed = await parseWorkbook(buffer)
    const plan = await planImport(parsed)

    const job = await ImportJob.create({
      createdBy: actor.id,
      fileName,
      status: 'DRY_RUN',
      rows: plan.rows,
      errors: plan.errors,
      willCreate: plan.willCreate,
      willUpdate: plan.willUpdate,
    })

    return {
      jobId: job._id.toString(),
      fileName,
      totalRows: parsed.length,
      willCreate: plan.willCreate,
      willUpdate: plan.willUpdate,
      errors: plan.errors,
    }
  },

  /**
   * Creates the accounts the dry run planned.
   *
   * Passwords are generated here and returned **once**, in this response.
   * They are not stored anywhere in the clear and cannot be retrieved again:
   * an operator who loses the list resets the accounts, which is the same
   * position they would be in if a colleague never opened the email.
   */
  async commit(actor, jobId) {
    const job = await ImportJob.findById(jobId)
    if (!job) {
      throw ApiError.notFound(
        'That import has expired or was never run — upload the file again',
        'IMPORT_JOB_EXPIRED'
      )
    }
    if (String(job.createdBy) !== String(actor.id)) {
      throw ApiError.forbidden('An import can only be committed by whoever ran it', 'IMPORT_NOT_YOURS')
    }
    if (job.status === 'COMMITTED') {
      throw ApiError.badRequest('This import has already been committed', 'IMPORT_ALREADY_COMMITTED')
    }

    const toCreate = job.rows.filter((row) => !row.exists)
    const credentials = []
    const created = []
    const failed = []

    for (const row of toCreate) {
      const password = generatePassword(GENERATED_PASSWORD_LENGTH)
      try {
        const user = await User.create({
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: row.fullName,
          jshshir: row.jshshir,
          email: row.email,
          phone: row.phone ?? '',
          passportSeries: row.passportSeries,
          employeeNumber: row.employeeNumber,
          passwordHash: await hashPassword(password),
          roleId: row.roleId,
          branch: row.branch ?? '',
          department: row.department ?? '',
          subdivision: row.subdivision ?? '',
          position: row.position ?? '',
        })
        created.push({ user, row })
        credentials.push({ jshshir: row.jshshir, fullName: row.fullName, password })
      } catch (error) {
        // One bad row must not abandon the other 294. It is reported with its
        // spreadsheet line so the operator can fix and re-import just that one.
        failed.push({ row: row.row, jshshir: row.jshshir, code: error.code === 11000 ? 'DUPLICATE' : 'WRITE_FAILED', message: error.message })
      }
    }

    // Reporting lines are attached after every account exists — a manager may
    // be further down the same file than the person reporting to them.
    await linkManagers(job.rows, created)

    for (const { user } of created) {
      await auditLogRepository.record({
        actor: actor.id,
        action: 'USER_CREATED',
        entity: 'User',
        entityId: user._id.toString(),
        metadata: { jshshir: user.jshshir, viaImport: job._id.toString() },
      })
      // Mandatory (§9.3), and best-effort like every other trigger: a relay
      // being down must not undo three hundred accounts.
      try {
        await notificationService.notify({
          userId: user._id,
          type: 'ACCOUNT_CREATED',
          vars: { jshshir: user.jshshir },
        })
      } catch (error) {
        logger.warn('Import: account-created notification failed', {
          userId: user._id.toString(),
          error: error.message,
        })
      }
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'USERS_IMPORTED',
      entity: 'ImportJob',
      entityId: job._id.toString(),
      metadata: { fileName: job.fileName, created: created.length, failed: failed.length },
    })

    job.status = 'COMMITTED'
    job.committedAt = new Date()
    job.createdCount = created.length
    // The parsed rows are dropped once they have been used: they are a copy
    // of everyone's identity details, and the job row itself is the record.
    job.rows = []
    await job.save()

    return { jobId: job._id.toString(), created: created.length, failed, credentials }
  },

  /** The error report, as the spreadsheet the operator will fix. */
  async errorWorkbook(actor, jobId) {
    const job = await ImportJob.findById(jobId).lean()
    if (!job) throw ApiError.notFound('That import has expired', 'IMPORT_JOB_EXPIRED')
    if (String(job.createdBy) !== String(actor.id)) throw ApiError.forbidden()

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Errors')
    sheet.columns = [
      { header: 'Satr', key: 'row', width: 8 },
      { header: 'Maydon', key: 'field', width: 20 },
      { header: 'Kod', key: 'code', width: 24 },
      { header: 'Izoh', key: 'message', width: 60 },
    ]
    sheet.getRow(1).font = { bold: true }
    for (const error of job.errors) sheet.addRow(error)
    return workbook.xlsx.writeBuffer()
  },
}

/**
 * Resolves managerJshshir to an account, for rows that named one.
 *
 * Done in one pass after the creates because the manager may be listed
 * further down the same file than their report — a per-row lookup would
 * simply not find them yet.
 */
async function linkManagers(rows, created) {
  const wanted = rows.filter((row) => row.managerJshshir).map((row) => row.managerJshshir)
  if (!wanted.length) return

  const managers = await User.find({ jshshir: { $in: [...new Set(wanted)] } }, { jshshir: 1 }).lean()
  const idByJshshir = new Map(managers.map((manager) => [manager.jshshir, manager._id]))

  const writes = []
  for (const { user, row } of created) {
    if (!row.managerJshshir) continue
    const managerId = idByJshshir.get(row.managerJshshir)
    // A manager who is not in the file and not in the database is left
    // unset rather than failing the account — the person exists either way,
    // and the reporting line can be filled in afterwards.
    if (!managerId || String(managerId) === String(user._id)) continue
    writes.push({ updateOne: { filter: { _id: user._id }, update: { $set: { managerId } } } })
  }
  if (writes.length) await User.bulkWrite(writes, { ordered: false })
}
