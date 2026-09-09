/**
 * Rebuilds the points-ledger indexes.
 *
 * The old pair was declared `sparse` on a compound key, which does not do
 * what it reads as: sparse skips a document only when *every* indexed field
 * is missing, and `userId` is always there. With `assessmentId` defaulting
 * to null rather than being absent, two video rows for one person both
 * indexed as `{userId, assessmentId: null}` and the second was rejected.
 *
 * `pointsService.award` treats a duplicate key as "already paid out", so the
 * rejection was silent: after their first video, every later award for that
 * person wrote nothing and returned `{ awarded: false }`.
 *
 * Existing databases keep the old index definitions until they are dropped,
 * so the model change alone fixes nothing — this drops and recreates them.
 *
 *   npm --prefix backend run migrate:points-indexes -- --dry-run
 *   npm --prefix backend run migrate:points-indexes
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { PointsLedger } from '../models/pointsLedger.model.js'

const dryRun = process.argv.includes('--dry-run')

const STALE = ['userId_1_videoId_1', 'userId_1_assessmentId_1']

async function main() {
  await connectDatabase()

  const before = await PointsLedger.collection.indexes()
  const stale = before.filter((index) => STALE.includes(index.name) && index.sparse && !index.partialFilterExpression)

  console.log(`${before.length} index(es) on pointsLedgers, ${stale.length} to replace`)
  for (const index of stale) console.log(`  ${index.name}: sparse compound unique — replacing with a partial filter`)

  if (dryRun) {
    console.log('\n--dry-run: nothing written')
  } else {
    for (const index of stale) await PointsLedger.collection.dropIndex(index.name)
    // Recreates from the schema, which now declares the partial filters.
    await PointsLedger.syncIndexes()
    console.log('\nWritten')
  }

  const after = await PointsLedger.collection.indexes()
  for (const index of after) {
    console.log(
      `  ${index.name} unique=${Boolean(index.unique)} partial=${JSON.stringify(index.partialFilterExpression ?? null)}`
    )
  }

  await mongoose.connection.close()
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('migratePointsIndexes.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
