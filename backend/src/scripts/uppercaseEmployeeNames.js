/**
 * Rewrites every employee's name parts in capitals — the way names enter
 * the system since 2026-09-22 (`capitalizeName`) and the way the reference's
 * user list shows them. Records written before that day are title-cased
 * ("Doston Xalilov") or whatever was typed; after this they all read the
 * same ("XALILOV DOSTON").
 *
 * `fullName` is recomposed from the parts (surname first, like everywhere
 * else) when the parts exist, and upper-cased as it is when they do not —
 * a record that never had separate parts must not lose its name.
 *
 * Idempotent: a row already in capitals is skipped, so it is safe to run
 * again after a partial run.
 *
 *   npm --prefix backend run migrate:uppercase-names -- --dry-run
 *   npm --prefix backend run migrate:uppercase-names
 */
import mongoose from 'mongoose'
import { capitalizeName, composeFullName } from '@lms/shared'
import { connectDatabase } from '../config/db.js'
import { logger } from '../config/logger.js'
import { User } from '../models/user.model.js'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  await connectDatabase()

  const users = await User.find({}, { firstName: 1, lastName: 1, patronymic: 1, fullName: 1 }).lean()
  let updated = 0
  for (const user of users) {
    const firstName = capitalizeName(user.firstName)
    const lastName = capitalizeName(user.lastName)
    const patronymic = capitalizeName(user.patronymic)
    const fullName = firstName || lastName ? composeFullName(firstName, lastName, patronymic) : capitalizeName(user.fullName)
    const same =
      firstName === (user.firstName ?? '') &&
      lastName === (user.lastName ?? '') &&
      patronymic === (user.patronymic ?? '') &&
      fullName === (user.fullName ?? '')
    if (same) continue
    updated += 1
    if (dryRun) continue
    await User.updateOne({ _id: user._id }, { $set: { firstName, lastName, patronymic, fullName } })
  }

  logger.info(
    dryRun ? 'Employee names → capitals (--dry-run): nothing written' : 'Employee names → capitals: complete',
    { examined: users.length, updated }
  )
}

main()
  .catch((error) => {
    logger.error('Employee names → capitals failed', { error: error instanceof Error ? error.message : error })
    process.exitCode = 1
  })
  .finally(() => mongoose.connection.close())
