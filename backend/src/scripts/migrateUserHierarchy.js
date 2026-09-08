/**
 * Migration M2 — fills in the reporting line from an HR export.
 *
 * There is no reporting line anywhere in the system to derive this from:
 * department says where someone sits, not who answers for them, and the two
 * disagree often enough that guessing would produce an org chart that is
 * confidently wrong. So this takes the answer from HR, as a CSV.
 *
 * Expected columns (header row required, order irrelevant):
 *
 *   jshshir           the employee, 14 digits
 *   managerJshshir    who they report to; blank for the people at the top
 *   employeeNumber    optional, HR's own key for the employee
 *
 * Every run is safe to repeat, and --dry-run is the point: an org chart is
 * the kind of data that is wrong in ten places the first time, and the
 * report tells you which ten before anything is written.
 *
 *   npm --prefix backend run migrate:hierarchy -- --file hr.csv --dry-run
 *   npm --prefix backend run migrate:hierarchy -- --file hr.csv
 */
import { readFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { User } from '../models/user.model.js'

const dryRun = process.argv.includes('--dry-run')
const fileIndex = process.argv.indexOf('--file')
const filePath = fileIndex === -1 ? null : process.argv[fileIndex + 1]

/**
 * A deliberately small CSV reader: quoted fields and commas inside them.
 * An HR export is a flat table of identifiers, and pulling in a parser for
 * three columns is not a trade worth making.
 */
export function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows.filter((entry) => entry.some((value) => value.trim()))
  if (!header) return []
  const keys = header.map((name) => name.trim())
  return body.map((entry) => Object.fromEntries(keys.map((key, index) => [key, (entry[index] ?? '').trim()])))
}

/**
 * Turns rows into writes, reporting everything it cannot do rather than
 * skipping quietly. An unmatched JSHSHIR is the normal failure — somebody
 * left, or the export covers a company the platform does not — and the
 * operator has to see it to know whether the number is 3 or 300.
 */
export function planUpdates(rows, usersByJshshir) {
  const updates = []
  const problems = []

  for (const [index, row] of rows.entries()) {
    const line = index + 2 // header is line 1
    const jshshir = (row.jshshir ?? '').replace(/\D/g, '')
    if (!jshshir) {
      problems.push(`line ${line}: no jshshir`)
      continue
    }
    const user = usersByJshshir.get(jshshir)
    if (!user) {
      problems.push(`line ${line}: no account with JSHSHIR ${jshshir}`)
      continue
    }

    const managerJshshir = (row.managerJshshir ?? '').replace(/\D/g, '')
    let managerId = null
    if (managerJshshir) {
      const manager = usersByJshshir.get(managerJshshir)
      if (!manager) {
        problems.push(`line ${line}: manager ${managerJshshir} has no account`)
        continue
      }
      if (String(manager._id) === String(user._id)) {
        problems.push(`line ${line}: ${jshshir} is listed as their own manager`)
        continue
      }
      managerId = manager._id
    }

    const set = {}
    if (String(user.managerId ?? '') !== String(managerId ?? '')) set.managerId = managerId
    const employeeNumber = (row.employeeNumber ?? '').trim()
    if (employeeNumber && employeeNumber !== (user.employeeNumber ?? '')) set.employeeNumber = employeeNumber

    if (Object.keys(set).length) updates.push({ _id: user._id, jshshir, set })
  }

  return { updates, problems }
}

/**
 * Walks the proposed chart looking for loops.
 *
 * Run over the whole plan rather than per row: A→B and B→A are each
 * perfectly valid on their own line, and only the pair is wrong. Writing
 * them and discovering it later means every traversal is already broken.
 */
export function findCycles(updates, usersById) {
  const managerOf = new Map()
  for (const [id, user] of usersById) managerOf.set(id, user.managerId ? String(user.managerId) : null)
  for (const update of updates) {
    if ('managerId' in update.set) managerOf.set(String(update._id), update.set.managerId ? String(update.set.managerId) : null)
  }

  const cycles = []
  for (const start of managerOf.keys()) {
    const seen = new Set([start])
    let current = managerOf.get(start)
    while (current) {
      if (seen.has(current)) {
        const names = [...seen].map((id) => usersById.get(id)?.jshshir ?? id)
        cycles.push(names.join(' -> '))
        break
      }
      seen.add(current)
      current = managerOf.get(current)
    }
  }
  // One loop is found once per member; report it once.
  return [...new Set(cycles.map((cycle) => cycle.split(' -> ').sort().join(' | ')))]
}

async function main() {
  if (!filePath) {
    console.error('Usage: npm --prefix backend run migrate:hierarchy -- --file <hr.csv> [--dry-run]')
    console.error('Columns: jshshir, managerJshshir, employeeNumber (optional)')
    process.exit(1)
  }

  const rows = parseCsv(await readFile(filePath, 'utf8'))
  console.log(`${rows.length} row(s) in ${filePath}`)

  await connectDatabase()
  const users = await User.find({}, { jshshir: 1, managerId: 1, employeeNumber: 1 }).lean()
  const usersByJshshir = new Map(users.map((user) => [user.jshshir, user]))
  const usersById = new Map(users.map((user) => [String(user._id), user]))

  const { updates, problems } = planUpdates(rows, usersByJshshir)
  const cycles = findCycles(updates, usersById)

  console.log(`${updates.length} account(s) to change, ${problems.length} row(s) that cannot be applied`)
  for (const problem of problems.slice(0, 25)) console.log(`  ${problem}`)
  if (problems.length > 25) console.log(`  ...and ${problems.length - 25} more`)

  if (cycles.length) {
    console.error(`\nRefusing to write: the result would contain ${cycles.length} reporting loop(s):`)
    for (const cycle of cycles) console.error(`  ${cycle}`)
    console.error('Fix the export and run again.')
    await mongoose.connection.close()
    process.exit(1)
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written')
  } else if (updates.length) {
    const result = await User.bulkWrite(
      updates.map((update) => ({ updateOne: { filter: { _id: update._id }, update: { $set: update.set } } })),
      { ordered: false }
    )
    console.log(`\nWritten: ${result.modifiedCount} account(s) updated`)
  } else {
    console.log('\nNothing to do')
  }

  const withManager = await User.countDocuments({ managerId: { $ne: null } })
  const total = await User.countDocuments()
  console.log(`Accounts with a manager: ${withManager} of ${total}`)

  await mongoose.connection.close()
  process.exit(0)
}

// Importable by the tests without running the migration.
if (process.argv[1] && process.argv[1].endsWith('migrateUserHierarchy.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
