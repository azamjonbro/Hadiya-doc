/**
 * Migration M9 — seeds the notification templates.
 *
 * 25 types × 3 languages × 3 channels = 225 rows, expanded from
 * `notificationTemplates.seed.js`. Before this, every notification was an
 * English template literal built at the call site, so an Uzbek employee read
 * "Deadline approaching: ..." and nobody without a deploy could change it.
 *
 * Safe to re-run. A row someone has edited in the admin UI carries
 * `customized: true` and is never overwritten — that is the whole reason the
 * flag exists, so adding a 26th type later does not silently revert wording
 * the training team has fixed. `--force` overrides that, deliberately loudly.
 *
 * Run with:
 *   npm --prefix backend run migrate:templates -- --dry-run
 *   npm --prefix backend run migrate:templates
 *   npm --prefix backend run migrate:templates -- --force
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import {
  NotificationTemplate,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LANGS,
} from '../models/notificationTemplate.model.js'
import {
  TEMPLATE_SEED,
  TEMPLATE_TYPES,
  EMAIL_FOOTER,
} from '../services/notifications/notificationTemplates.seed.js'
import { extractPlaceholders } from '../services/notifications/notificationTemplate.service.js'

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

/**
 * One seed entry becomes three rows. The channels are not the same message
 * in three wrappers: mail can afford a closing line and a link, the bell
 * cannot, and a lock screen has about sixty characters.
 */
export function rowsFor(type, lang, entry) {
  const text = entry[lang]
  const defaults = text.defaults ?? {}
  return [
    {
      type,
      channel: 'IN_APP',
      lang,
      subject: text.subject,
      body: text.body,
      placeholders: entry.placeholders,
      defaults,
    },
    {
      type,
      channel: 'EMAIL',
      lang,
      subject: text.subject,
      body: `${text.body}\n\n${EMAIL_FOOTER[lang]}`,
      placeholders: entry.placeholders,
      defaults,
    },
    {
      type,
      channel: 'PUSH',
      lang,
      subject: text.push,
      body: '',
      placeholders: entry.placeholders,
      defaults,
    },
  ]
}

/**
 * A placeholder written in the text but missing from the allowlist would
 * render as an empty string forever, silently. That is a seed bug, and the
 * migration refuses to write anything until it is fixed — the whole point of
 * the allowlist is that it is complete.
 */
export function validateSeed() {
  const problems = []
  for (const type of TEMPLATE_TYPES) {
    const entry = TEMPLATE_SEED[type]
    if (!entry) {
      problems.push(`${type}: listed in TEMPLATE_TYPES but missing from TEMPLATE_SEED`)
      continue
    }
    for (const lang of NOTIFICATION_LANGS) {
      if (!entry[lang]) {
        problems.push(`${type}.${lang}: missing translation`)
        continue
      }
      const { subject, body, push } = entry[lang]
      if (!subject || !push) problems.push(`${type}.${lang}: subject and push are both required`)
      const used = new Set([
        ...extractPlaceholders(subject),
        ...extractPlaceholders(body),
        ...extractPlaceholders(push),
      ])
      for (const name of used) {
        if (!entry.placeholders.includes(name)) {
          problems.push(`${type}.${lang}: "{{${name}}}" is used but not in placeholders`)
        }
      }
    }
  }
  for (const type of Object.keys(TEMPLATE_SEED)) {
    if (!TEMPLATE_TYPES.includes(type)) {
      problems.push(`${type}: in TEMPLATE_SEED but not listed in TEMPLATE_TYPES`)
    }
  }
  return problems
}

export function buildAllRows() {
  const rows = []
  for (const type of TEMPLATE_TYPES) {
    for (const lang of NOTIFICATION_LANGS) {
      rows.push(...rowsFor(type, lang, TEMPLATE_SEED[type]))
    }
  }
  return rows
}

async function main() {
  const problems = validateSeed()
  if (problems.length) {
    console.error(`Seed is not consistent (${problems.length} problem(s)):`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exit(1)
  }

  const rows = buildAllRows()
  const expected = TEMPLATE_TYPES.length * NOTIFICATION_LANGS.length * NOTIFICATION_CHANNELS.length
  console.log(
    `Seed is consistent: ${TEMPLATE_TYPES.length} types × ${NOTIFICATION_LANGS.length} languages × ` +
      `${NOTIFICATION_CHANNELS.length} channels = ${rows.length} rows (expected ${expected})`
  )

  await connectDatabase()

  const existing = await NotificationTemplate.find(
    {},
    { type: 1, channel: 1, lang: 1, customized: 1 }
  ).lean()
  const byKey = new Map(existing.map((row) => [`${row.type}|${row.channel}|${row.lang}`, row]))

  let inserted = 0
  let updated = 0
  let keptCustom = 0
  const writes = []

  for (const row of rows) {
    const key = `${row.type}|${row.channel}|${row.lang}`
    const current = byKey.get(key)
    if (!current) {
      inserted += 1
      writes.push({ insertOne: { document: { ...row, customized: false } } })
      continue
    }
    if (current.customized && !force) {
      keptCustom += 1
      continue
    }
    updated += 1
    writes.push({
      updateOne: {
        filter: { _id: current._id },
        update: { $set: { ...row, ...(force && current.customized ? { customized: false } : {}) } },
      },
    })
  }

  console.log(
    `${inserted} to insert, ${updated} to update, ${keptCustom} left alone (edited by hand)` +
      (force && keptCustom === 0 && existing.some((r) => r.customized) ? ' — --force is overwriting edits' : '')
  )

  if (dryRun) {
    console.log('--dry-run: nothing written')
  } else if (writes.length) {
    // timestamps: false so a re-run that changes nothing does not bump
    // updatedAt on all 225 rows — "when was this last edited" has to keep
    // meaning something.
    const result = await NotificationTemplate.bulkWrite(writes, { ordered: false, timestamps: false })
    console.log(`Written: ${result.insertedCount ?? 0} inserted, ${result.modifiedCount ?? 0} modified`)
  } else {
    console.log('Nothing to do')
  }

  // Rows for a type the seed no longer has — left behind by a rename, which
  // is how COMPLIANCE_REASSIGNED became COMPLIANCE_RETRAINING_DUE. Reported
  // always; removed only when nobody has edited them, because a customized
  // orphan is somebody's work and deleting it silently is not this script's
  // decision to make.
  const orphans = await NotificationTemplate.find({ type: { $nin: TEMPLATE_TYPES } }, { type: 1, customized: 1 }).lean()
  if (orphans.length) {
    const types = [...new Set(orphans.map((row) => row.type))]
    const editedTypes = [...new Set(orphans.filter((row) => row.customized).map((row) => row.type))]
    console.log(`${orphans.length} row(s) for retired type(s): ${types.join(', ')}`)
    if (!dryRun) {
      const removable = orphans.filter((row) => !row.customized).map((row) => row._id)
      if (removable.length) {
        await NotificationTemplate.deleteMany({ _id: { $in: removable } })
        console.log(`Removed ${removable.length} unedited orphan row(s)`)
      }
    }
    if (editedTypes.length) {
      console.log(`Kept (edited by hand — delete by hand if they are truly gone): ${editedTypes.join(', ')}`)
    }
  }

  const total = await NotificationTemplate.countDocuments()
  console.log(`Templates in the database: ${total}`)

  await mongoose.connection.close()
  process.exit(0)
}

// Importable by the tests without running the migration.
if (process.argv[1] && process.argv[1].endsWith('migrateNotificationTemplates.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
