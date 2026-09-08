/**
 * Lists and restores encrypted backups.
 *
 *   npm --prefix backend run backup:list
 *   npm --prefix backend run backup:restore -- --latest --target mongodb://localhost:27017/qollanma_restore_check
 *   npm --prefix backend run backup:restore -- --key mongo/qollanma-2026-09-08T03-20-00Z.archive.gz.enc --target ...
 *
 * --target is mandatory and defaults to nothing on purpose. A restore drill
 * belongs in a throwaway database; restoring over the live one is a real
 * disaster-recovery action and has to be asked for explicitly with --force,
 * so that a mistyped flag can never be the thing that empties production.
 */
import { env } from '../config/env.js'
import { databaseNameFromUri, listBackups, restoreBackup } from '../services/backup/backup.service.js'

function flag(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : (process.argv[index + 1] ?? true)
}

const wantsList = process.argv.includes('--list')
const backups = await listBackups()

if (wantsList || (!flag('key') && !process.argv.includes('--latest'))) {
  if (!backups.length) {
    console.log(`No backups in ${env.S3_BUCKET_BACKUPS}.`)
  }
  for (const backup of backups) {
    console.log(
      `${backup.key}\t${(backup.size / 1024 / 1024).toFixed(1)} MiB\t${new Date(backup.lastModified).toISOString()}`
    )
  }
  if (!wantsList) {
    console.error('\nPass --latest or --key <object-key>, plus --target <mongodb-uri>.')
    process.exit(1)
  }
  process.exit(0)
}

const objectKey = process.argv.includes('--latest') ? backups[0]?.key : flag('key')
if (!objectKey) {
  console.error('No backup to restore (bucket is empty).')
  process.exit(1)
}

const targetUri = flag('target')
if (typeof targetUri !== 'string') {
  console.error('--target <mongodb-uri> is required — the database to restore INTO.')
  process.exit(1)
}

const targetDb = databaseNameFromUri(targetUri)
const liveDb = databaseNameFromUri(env.MONGO_URI)
const force = process.argv.includes('--force')
if (targetDb === liveDb && !force) {
  console.error(
    `Refusing to restore into "${targetDb}", the database this deployment is running on.\n` +
      'For a drill, point --target at a scratch database name. For a real recovery, add --force.'
  )
  process.exit(1)
}

console.log(`Restoring ${objectKey}\n  -> ${targetDb}${force ? ' (--force, --drop)' : ''}`)
try {
  await restoreBackup({ objectKey, targetUri, drop: force })
  console.log('OK    restored. Verify collection counts before pointing the app at it.')
  process.exit(0)
} catch (error) {
  console.error(`FAIL  ${error.message}`)
  process.exit(1)
}
