/**
 * Takes one backup right now, outside the nightly schedule.
 *
 *   npm --prefix backend run backup:now
 *
 * Used before a risky migration or deploy, and to prove the pipeline works
 * on a box that has just been configured — the failure modes (mongodump
 * missing from PATH, a bucket that doesn't exist, a wrong key length) all
 * surface here in seconds instead of at 03:20 in a log nobody reads.
 */
import { env } from '../config/env.js'
import { createBackup } from '../services/backup/backup.service.js'

if (!env.BACKUP_ENABLED) {
  console.error('BACKUP_ENABLED is false — set it and BACKUP_ENCRYPTION_KEY in backend/.env first.')
  process.exit(1)
}

try {
  const { key, size, pruned } = await createBackup()
  console.log(`OK    ${key} (${(size / 1024 / 1024).toFixed(1)} MiB) -> ${env.S3_BUCKET_BACKUPS}`)
  if (pruned.length) {
    console.log(`      pruned ${pruned.length} archive(s) older than ${env.BACKUP_RETENTION_DAYS} days`)
  }
  process.exit(0)
} catch (error) {
  console.error(`FAIL  ${error.message}`)
  process.exit(1)
}
