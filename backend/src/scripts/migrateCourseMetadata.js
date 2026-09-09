/**
 * Migration M3 — backfills the catalog metadata onto existing courses.
 *
 * Mongoose schema defaults do not touch documents that are already stored:
 * a course created last year has no `level`, no `navigationMode` and no
 * `version` field at all. Reads survive that (the DTO fills the gaps), but
 * the new filters do not — `{ level: 'BEGINNER' }` matches a stored
 * `"BEGINNER"`, never a missing field, so every pre-existing course would
 * silently vanish from a filtered catalog.
 *
 * Every default is chosen to preserve current behaviour exactly:
 *
 *   navigationMode: 'SEQUENTIAL'  what courseSequence.js already enforces
 *   allowSelfEnroll: false        everything is assigned today
 *   validityDays: 0               nothing expires today
 *   version: 1                    nothing has been versioned yet
 *   level: 'BEGINNER'             a neutral value, visible and editable
 *
 * so running it changes what the database *says* and not what the platform
 * *does*. Repeatable: only documents actually missing a field are touched,
 * and a second run reports nothing to do.
 *
 *   npm --prefix backend run migrate:course-metadata -- --dry-run
 *   npm --prefix backend run migrate:course-metadata
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { Course } from '../models/course.model.js'

const dryRun = process.argv.includes('--dry-run')

// Field -> the value a document gets when it does not have that field.
export const M3_DEFAULTS = {
  categoryId: null,
  tags: [],
  level: 'BEGINNER',
  authorIds: [],
  estimatedMinutes: 0,
  prerequisiteCourseIds: [],
  certificateTemplateId: null,
  navigationMode: 'SEQUENTIAL',
  validityDays: 0,
  version: 1,
  allowSelfEnroll: false,
}

/**
 * One `updateMany` per field rather than one for all of them.
 *
 * A single `$set` of every default would overwrite the fields a course
 * already has — a course whose completion rule was tuned to 80% would be
 * reset to the default, which is data loss dressed up as a migration. Per
 * field, filtered on `$exists: false`, nothing that exists is touched.
 */
export function planWrites(defaults = M3_DEFAULTS) {
  return Object.entries(defaults).map(([field, value]) => ({
    field,
    filter: { [field]: { $exists: false } },
    update: { $set: { [field]: value } },
  }))
}

async function main() {
  await connectDatabase()

  const total = await Course.countDocuments()
  console.log(`${total} course(s) in the database`)

  const writes = planWrites()
  let touched = 0

  for (const write of writes) {
    const count = await Course.countDocuments(write.filter)
    if (!count) continue
    touched += count
    console.log(`  ${write.field}: ${count} course(s) missing it`)
    if (!dryRun) await Course.updateMany(write.filter, write.update)
  }

  // The completion rule is a subdocument, so `$exists` on the parent is the
  // right check — a course either has the whole object or none of it.
  const missingRule = await Course.countDocuments({ completionRule: { $exists: false } })
  if (missingRule) {
    touched += missingRule
    console.log(`  completionRule: ${missingRule} course(s) missing it`)
    if (!dryRun) {
      await Course.updateMany(
        { completionRule: { $exists: false } },
        { $set: { completionRule: { minPercent: 100, requireAllRequired: true } } }
      )
    }
  }

  if (!touched) console.log('\nNothing to do — every course already carries the metadata fields')
  else if (dryRun) console.log('\n--dry-run: nothing written')
  else console.log('\nWritten')

  // The text index is created by the model on connect, but only once the
  // process has actually touched the collection. Saying so beats leaving
  // the operator to guess whether search will work.
  const indexes = await Course.collection.indexes()
  const hasText = indexes.some((index) => index.name === 'course_text')
  console.log(`Full-text index course_text: ${hasText ? 'present' : 'MISSING — start the backend once to build it'}`)

  await mongoose.connection.close()
  process.exit(0)
}

// Importable by the tests without running the migration.
if (process.argv[1] && process.argv[1].endsWith('migrateCourseMetadata.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
