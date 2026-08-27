/**
 * Splits the single `fullName` written before the employee form had two fields
 * into `firstName` / `lastName`.
 *
 * Surname first is how these were typed and how the app renders them, so the
 * first word becomes the surname and the rest the given name — with one
 * exception: a single-word entry is taken as a given name, because "Dilshod"
 * with no surname is a far more common way to find these records than a bare
 * surname would be.
 *
 * Idempotent: rows that already carry either half are left alone, so it is safe
 * to run again after a partial run. `fullName` is never rewritten — everything
 * else in the app reads it, and this migration is not the place to change how
 * anyone's name is displayed.
 *
 *   npm --prefix backend run migrate:names
 */
import mongoose from 'mongoose'
import { splitFullName } from '@lms/shared'
import { connectDatabase } from '../config/db.js'
import { logger } from '../config/logger.js'
import { User } from '../models/user.model.js'

async function main() {
  await connectDatabase()

  const pending = await User.find({
    $or: [
      { firstName: { $in: ['', null] } },
      { firstName: { $exists: false } },
    ],
    lastName: { $in: ['', null, undefined] },
  })

  let updated = 0
  for (const user of pending) {
    const { firstName, lastName } = splitFullName(user.fullName)
    if (!firstName && !lastName) continue
    await User.updateOne({ _id: user._id }, { $set: { firstName, lastName } })
    updated += 1
  }

  logger.info('Employee name backfill complete', { examined: pending.length, updated })
}

main()
  .catch((error) => {
    logger.error('Employee name backfill failed', { error: error instanceof Error ? error.message : error })
    process.exitCode = 1
  })
  .finally(() => mongoose.connection.close())
