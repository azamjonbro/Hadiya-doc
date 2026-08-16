/**
 * One-off migration for the JSHSHIR identity rework.
 *
 * `username` is gone: an employee now signs in with their JSHSHIR (14 digits)
 * or passport series, and `email` became optional. Existing accounts have
 * neither field, and `jshshir` is required and unique — so every account has to
 * be given one before the app will accept a write to it.
 *
 * A real JSHSHIR cannot be derived from a username, so accounts that lack one
 * get a **placeholder** starting with `9`. That first digit encodes century and
 * gender in a genuine JSHSHIR and is only ever 1–6, so a `9…` value is
 * recognisably not a real number — an admin can list them in the users table by
 * searching `9` and replace them with the real ones. The old username is kept
 * on the document as `legacyUsername` so each account can still be identified.
 *
 * Also drops the two unique indexes the old schema declared. Mongoose creates
 * indexes but never drops ones it no longer declares, and both are now wrong:
 * `username_1` indexes a field that no longer exists, and a plain unique
 * `email_1` would make the *second* employee without an email collide with the
 * first. user.model.js replaces them with partial indexes.
 *
 * Run with:
 *   npm --prefix backend run migrate:jshshir -- --dry-run   # report only
 *   npm --prefix backend run migrate:jshshir
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { logger } from '../config/logger.js'
import { User } from '../models/user.model.js'

const dryRun = process.argv.includes('--dry-run')

const PLACEHOLDER_PREFIX = '9'
const STALE_INDEXES = ['username_1', 'email_1']

async function dropStaleIndexes() {
  const indexes = await User.collection.indexes()
  for (const index of indexes) {
    if (!STALE_INDEXES.includes(index.name)) continue
    if (dryRun) {
      logger.info(`[dry-run] would drop stale index users.${index.name}`)
      continue
    }
    await User.collection.dropIndex(index.name)
    logger.info(`Dropped stale index users.${index.name}`)
  }
}

/**
 * Placeholders are numbered from the highest one already in the collection, so
 * re-running after a partial failure never hands out a JSHSHIR twice.
 */
async function nextPlaceholderSeed() {
  const [highest] = await User.collection
    .find({ jshshir: { $regex: `^${PLACEHOLDER_PREFIX}\\d{13}$` } })
    .sort({ jshshir: -1 })
    .limit(1)
    .toArray()

  return highest ? Number(highest.jshshir.slice(1)) : 0
}

function placeholderFor(sequence) {
  return PLACEHOLDER_PREFIX + String(sequence).padStart(13, '0')
}

async function main() {
  await connectDatabase()
  await dropStaleIndexes()

  // `.collection` rather than the model: these documents do not satisfy the
  // current schema yet, which is the whole point of the migration.
  const pending = await User.collection.find({ jshshir: { $exists: false } }).toArray()
  const blankEmails = await User.collection.countDocuments({ email: '' })

  if (!pending.length && !blankEmails) {
    logger.info('Every account already has a JSHSHIR — nothing to migrate')
    return
  }

  logger.info(`Found ${pending.length} account(s) without a JSHSHIR, ${blankEmails} with a blank email`)

  let sequence = await nextPlaceholderSeed()
  const assigned = []

  for (const user of pending) {
    sequence += 1
    const jshshir = placeholderFor(sequence)
    assigned.push({ id: user._id.toString(), fullName: user.fullName, username: user.username ?? '', jshshir })

    if (dryRun) continue

    const update = { $set: { jshshir }, $unset: { username: '' } }
    if (user.username) update.$set.legacyUsername = user.username
    // A blank email is indexed by the new partial unique index; only an absent
    // one is skipped.
    if (!user.email) update.$unset.email = ''

    await User.collection.updateOne({ _id: user._id }, update)
  }

  if (!dryRun) {
    await User.collection.updateMany({ email: '' }, { $unset: { email: '' } })
    await User.syncIndexes()
    logger.info('Rebuilt user indexes')
  }

  logger.info(`${dryRun ? '[dry-run] would assign' : 'Assigned'} ${assigned.length} placeholder JSHSHIR(s)`, {
    accounts: assigned,
  })

  if (assigned.length) {
    logger.warn(
      `${assigned.length} account(s) now hold a placeholder JSHSHIR beginning with "${PLACEHOLDER_PREFIX}". ` +
        'They cannot sign in by JSHSHIR until an admin replaces it with the real number ' +
        '(accounts with an email can still sign in with that).'
    )
  }
}

main()
  .catch((error) => {
    logger.error('JSHSHIR migration failed', { error: error instanceof Error ? error.message : error })
    process.exitCode = 1
  })
  .finally(() => mongoose.connection.close())
