/**
 * Migration M4 — gives every existing account a locale and a prefs object.
 *
 * Both fields have schema defaults, so a *new* account is fine without this.
 * Existing documents are not: Mongoose applies a default when a document is
 * created, not retroactively, so every account that predates 1.3 has neither
 * field. Reads cope (the resolver treats a missing prefs object as "nothing
 * switched off"), but a $set-less document means `locale` is absent rather
 * than 'uz', and a query like "who reads Russian" would silently miss
 * everyone instead of matching nobody — a different and much quieter bug.
 *
 * Idempotent: only touches documents actually missing the field.
 *
 * Run with:
 *   npm --prefix backend run migrate:prefs -- --dry-run
 *   npm --prefix backend run migrate:prefs
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { User } from '../models/user.model.js'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  await connectDatabase()

  const missingLocale = await User.countDocuments({ locale: { $exists: false } })
  const missingPrefs = await User.countDocuments({ notificationPrefs: { $exists: false } })
  const total = await User.countDocuments()

  console.log(`${total} account(s): ${missingLocale} without locale, ${missingPrefs} without notificationPrefs`)

  if (dryRun) {
    console.log('--dry-run: nothing written')
  } else {
    // Two separate updates rather than one $or: an account can be missing
    // either field independently, and setting locale on a document that
    // already has one would overwrite a choice someone made.
    const localeResult = await User.updateMany({ locale: { $exists: false } }, { $set: { locale: 'uz' } })
    const prefsResult = await User.updateMany(
      { notificationPrefs: { $exists: false } },
      { $set: { notificationPrefs: {} } }
    )
    console.log(`locale set on ${localeResult.modifiedCount}, notificationPrefs set on ${prefsResult.modifiedCount}`)
  }

  const remaining = await User.countDocuments({
    $or: [{ locale: { $exists: false } }, { notificationPrefs: { $exists: false } }],
  })
  console.log(`Accounts still missing a field: ${remaining}`)

  await mongoose.connection.close()
  process.exit(0)
}

main().catch(async (error) => {
  console.error(`Migration failed: ${error.message}`)
  await mongoose.connection.close().catch(() => {})
  process.exit(1)
})
