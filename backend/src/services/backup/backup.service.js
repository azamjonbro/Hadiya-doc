/**
 * Nightly database backup: mongodump -> AES-256-GCM -> object storage,
 * with a retention sweep and a restore path that is exercised by
 * test/backup.test.js rather than only described in a document.
 *
 * Deliberately shells out to mongodump instead of walking collections with
 * the driver: a hand-rolled dump loses indexes, index options and BSON
 * types that don't survive a JSON round trip, and it is the restore side
 * where that is discovered.
 */
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { decryptFile, encryptFile, parseBackupKey } from './backupCrypto.js'

export const BACKUP_PREFIX = 'mongo/'
const CONTENT_TYPE = 'application/octet-stream'

const defaultStorage = () => new S3StorageProvider(env.S3_BUCKET_BACKUPS)

/** The database a mongodb:// URI points at — the namespace inside the archive. */
export function databaseNameFromUri(uri) {
  // `new URL` refuses mongodb+srv hosts lists, so the path is read directly.
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '')
  const afterHost = withoutScheme.slice(withoutScheme.indexOf('/') + 1)
  const name = afterHost.split('?')[0]
  if (!withoutScheme.includes('/') || !name) {
    throw new Error(`MongoDB URI has no database name: ${uri.replace(/\/\/[^@]*@/, '//***@')}`)
  }
  return decodeURIComponent(name)
}

/**
 * The same URI with the database name removed, query string kept.
 *
 * mongorestore treats a database in the URI as `--db`, and `--db` filters
 * the archive by the ORIGINAL namespace — so combining it with a namespace
 * rewrite matches nothing and exits 0 having restored zero documents. The
 * only visible symptom is an empty target database, which is exactly the
 * kind of silence a restore drill exists to catch.
 */
export function withoutDatabase(uri) {
  const schemeEnd = uri.indexOf('//') + 2
  const rest = uri.slice(schemeEnd)
  const pathStart = rest.indexOf('/')
  if (pathStart === -1) return `${uri}/`
  const query = rest.slice(pathStart).split('?')[1]
  return `${uri.slice(0, schemeEnd)}${rest.slice(0, pathStart)}/${query ? `?${query}` : ''}`
}

function run(bin, args, label) {
  return new Promise((resolve, reject) => {
    // No shell: the URI carries a password, and a shell would also make the
    // argument list a quoting problem on every unusual character in it.
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.stdout.resume()
    child.on('error', (error) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(`${bin} not found on PATH — install the MongoDB Database Tools, or set ${label}_BIN to an absolute path`)
          : error
      )
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      // Only the tail: mongodump writes a progress line per collection, and
      // the reason for the failure is always at the end.
      const tail = stderr.trim().split('\n').slice(-5).join('\n')
      reject(new Error(`${bin} exited with code ${code}\n${tail}`))
    })
  })
}

// Object keys sort lexicographically, and this timestamp shape makes that
// the same as chronological order — which is what "the latest backup" relies
// on when a listing comes back unordered.
function backupKeyFor(date, database) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z')
  return `${BACKUP_PREFIX}${database}-${stamp}.archive.gz.enc`
}

/**
 * Deletes archives older than the retention window, always keeping the most
 * recent one. Without that floor, a month of failed backups would end with
 * the sweep deleting the last good archive — turning a broken job into data
 * loss.
 */
export async function pruneOldBackups({ storage = defaultStorage(), retentionDays = env.BACKUP_RETENTION_DAYS, now = new Date() } = {}) {
  const objects = await storage.listObjects(BACKUP_PREFIX)
  if (objects.length <= 1) return []

  const newest = objects.reduce((a, b) => (a.key > b.key ? a : b))
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000
  const expired = objects.filter(
    (object) => object.key !== newest.key && new Date(object.lastModified).getTime() < cutoff
  )

  for (const object of expired) {
    await storage.deleteObject(object.key)
  }
  return expired.map((object) => object.key)
}

export async function createBackup({
  storage = defaultStorage(),
  mongoUri = env.MONGO_URI,
  encryptionKey = env.BACKUP_ENCRYPTION_KEY,
  retentionDays = env.BACKUP_RETENTION_DAYS,
  now = new Date(),
} = {}) {
  const key = parseBackupKey(encryptionKey)
  const database = databaseNameFromUri(mongoUri)
  const workDir = await mkdtemp(path.join(tmpdir(), 'qollanma-backup-'))
  const archivePath = path.join(workDir, 'dump.archive.gz')
  const encryptedPath = `${archivePath}.enc`
  const startedAt = Date.now()

  try {
    // --gzip compresses inside the archive, so nothing is ever written to
    // disk uncompressed; --archive keeps it a single file to encrypt.
    await run(env.MONGODUMP_BIN, ['--uri', mongoUri, `--archive=${archivePath}`, '--gzip'], 'MONGODUMP')
    await encryptFile(archivePath, encryptedPath, key)

    const { size } = await stat(encryptedPath)
    const objectKey = backupKeyFor(now, database)
    await storage.putObject(objectKey, createReadStream(encryptedPath), CONTENT_TYPE, {
      contentLength: size,
    })

    const pruned = await pruneOldBackups({ storage, retentionDays, now })
    logger.info('Database backup uploaded', {
      key: objectKey,
      bytes: size,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      pruned: pruned.length,
    })
    return { key: objectKey, size, pruned }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export async function listBackups({ storage = defaultStorage() } = {}) {
  const objects = await storage.listObjects(BACKUP_PREFIX)
  return objects.sort((a, b) => (a.key < b.key ? 1 : -1))
}

/**
 * Restores one archive into `targetUri`.
 *
 * The archive remembers the database it came from, so restoring into a
 * differently named database needs an explicit namespace rewrite — which is
 * the normal case here, because a restore drill must never be pointed at the
 * live database.
 */
export async function restoreBackup({
  objectKey,
  targetUri,
  storage = defaultStorage(),
  encryptionKey = env.BACKUP_ENCRYPTION_KEY,
  sourceUri = env.MONGO_URI,
  drop = false,
}) {
  const key = parseBackupKey(encryptionKey)
  const sourceDb = databaseNameFromUri(sourceUri)
  const targetDb = databaseNameFromUri(targetUri)
  const workDir = await mkdtemp(path.join(tmpdir(), 'qollanma-restore-'))
  const encryptedPath = path.join(workDir, 'dump.archive.gz.enc')
  const archivePath = path.join(workDir, 'dump.archive.gz')

  try {
    await pipeline(await storage.getObject(objectKey), createWriteStream(encryptedPath))
    await decryptFile(encryptedPath, archivePath, key)

    const rewriting = sourceDb !== targetDb
    const args = [
      '--uri',
      rewriting ? withoutDatabase(targetUri) : targetUri,
      `--archive=${archivePath}`,
      '--gzip',
      ...(drop ? ['--drop'] : []),
      ...(rewriting ? [`--nsFrom=${sourceDb}.*`, `--nsTo=${targetDb}.*`] : []),
    ]
    await run(env.MONGORESTORE_BIN, args, 'MONGORESTORE')
    logger.info('Database backup restored', { key: objectKey, targetDb, drop })
    return { objectKey, sourceDb, targetDb }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
