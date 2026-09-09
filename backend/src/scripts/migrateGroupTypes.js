/**
 * Migration M-groups — marks existing groups as STATIC.
 *
 * The code does not actually need this: every query looks for
 * `type: 'DYNAMIC'` rather than `$ne: 'STATIC'`, precisely so that groups
 * stored before the field existed cannot be swept into a rebuild that would
 * empty their hand-curated membership. The DTO defaults the value on read
 * too.
 *
 * It is still worth running once, so that "what type is this group" has the
 * same answer in the database as it does on screen — the next person to
 * write a query against this collection should not have to know about the
 * missing-field case.
 *
 *   npm --prefix backend run migrate:group-types -- --dry-run
 *   npm --prefix backend run migrate:group-types
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { Group } from '../models/group.model.js'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  await connectDatabase()

  const missing = await Group.countDocuments({ type: { $exists: false } })
  console.log(`${await Group.countDocuments()} group(s) total, ${missing} without a type`)

  if (!missing) console.log('\nNothing to do')
  else if (dryRun) console.log('\n--dry-run: nothing written')
  else {
    // Only documents actually missing the field. A blanket $set would
    // overwrite a group somebody has already converted to DYNAMIC.
    const result = await Group.updateMany({ type: { $exists: false } }, { $set: { type: 'STATIC' } })
    console.log(`\nWritten: ${result.modifiedCount} group(s) marked STATIC`)
  }

  await mongoose.connection.close()
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('migrateGroupTypes.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
