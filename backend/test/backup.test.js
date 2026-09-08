// The restore drill, as a test rather than a paragraph in a runbook.
//
// A backup is only ever worth what a restore proves, and the parts that
// actually break — mongodump missing from PATH, an archive whose namespace
// can't be rewritten, an auth tag that no longer matches, indexes lost on
// the way back — are all invisible to a unit test of the encryption alone.
// So this runs the real chain end to end against the local MongoDB:
//
//   seed -> mongodump --archive --gzip -> AES-256-GCM -> object store
//        -> download -> decrypt -> mongorestore -> compare
//
// Object storage is the one stubbed part (MinIO needs Docker, which isn't
// available on the dev laptops); the stub implements the same four methods
// S3StorageProvider exposes, so createBackup/restoreBackup run unmodified.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { MongoClient } from 'mongodb'
import { env } from '../src/config/env.js'
import {
  createBackup,
  databaseNameFromUri,
  listBackups,
  pruneOldBackups,
  restoreBackup,
  withoutDatabase,
} from '../src/services/backup/backup.service.js'
import {
  decryptFile,
  encryptFile,
  generateBackupKey,
  parseBackupKey,
} from '../src/services/backup/backupCrypto.js'

const KEY = generateBackupKey()

// A filesystem-backed stand-in for S3StorageProvider, same call shape.
class FakeStore {
  constructor(dir) {
    this.dir = dir
    this.meta = new Map()
  }

  pathFor(key) {
    return path.join(this.dir, key.replace(/\//g, '__'))
  }

  async putObject(key, body, _contentType, { contentLength } = {}) {
    assert.equal(typeof contentLength, 'number', 'a stream upload must declare its length')
    await pipeline(body, createWriteStream(this.pathFor(key)))
    const { size } = await stat(this.pathFor(key))
    assert.equal(size, contentLength, 'declared length must match what was written')
    this.meta.set(key, { size, lastModified: new Date() })
  }

  async getObject(key) {
    return createReadStream(this.pathFor(key))
  }

  async listObjects(prefix) {
    return [...this.meta.entries()]
      .filter(([key]) => key.startsWith(prefix ?? ''))
      .map(([key, value]) => ({ key, ...value }))
  }

  async deleteObject(key) {
    this.meta.delete(key)
    await rm(this.pathFor(key), { force: true })
  }
}

function toolsInstalled() {
  for (const bin of [env.MONGODUMP_BIN, env.MONGORESTORE_BIN]) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' })
    } catch {
      return false
    }
  }
  return true
}

const uriFor = (database) => env.MONGO_URI.replace(/\/[^/?]+(\?|$)/, `/${database}$1`)
const SOURCE_DB = 'qollanma_backup_drill_src'
const TARGET_DB = 'qollanma_backup_drill_dst'

// Documents chosen for what a naive JSON-based "backup" would quietly
// mangle: a Date, a nested array, an explicit null, a unique index.
const SEED = [
  {
    _id: 1,
    jshshir: '12345678901234',
    joinedAt: new Date('2026-01-15T08:00:00Z'),
    points: 4200,
    tags: ['a', 'b'],
    manager: null,
  },
  {
    _id: 2,
    jshshir: '43210987654321',
    joinedAt: new Date('2026-06-01T00:00:00Z'),
    points: 0,
    tags: [],
    manager: 1,
  },
]

describe('backup envelope', () => {
  let dir
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'backup-crypto-test-'))
  })
  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('round-trips a file byte for byte', async () => {
    const plain = path.join(dir, 'plain.bin')
    await writeFile(plain, Buffer.concat([Buffer.from('a'.repeat(200_000)), Buffer.from([0x00, 0xff, 0x80])]))
    await encryptFile(plain, path.join(dir, 'enc'), parseBackupKey(KEY))
    await decryptFile(path.join(dir, 'enc'), path.join(dir, 'out'), parseBackupKey(KEY))
    assert.deepEqual(await readFile(path.join(dir, 'out')), await readFile(plain))
  })

  test('the ciphertext is not the plaintext', async () => {
    const encrypted = await readFile(path.join(dir, 'enc'))
    assert.ok(!encrypted.includes(Buffer.from('aaaaaaaaaa')), 'plaintext leaked into the archive')
  })

  test('a flipped byte fails loudly instead of restoring half a database', async () => {
    const tampered = path.join(dir, 'tampered')
    const bytes = await readFile(path.join(dir, 'enc'))
    bytes[100] ^= 0xff
    await writeFile(tampered, bytes)
    await assert.rejects(() => decryptFile(tampered, path.join(dir, 'out2'), parseBackupKey(KEY)))
  })

  test('the wrong key fails', async () => {
    await assert.rejects(() =>
      decryptFile(path.join(dir, 'enc'), path.join(dir, 'out3'), parseBackupKey(generateBackupKey()))
    )
  })

  test('a file that is not a backup says so', async () => {
    const notABackup = path.join(dir, 'notabackup')
    await writeFile(notABackup, Buffer.alloc(100, 7))
    await assert.rejects(
      () => decryptFile(notABackup, path.join(dir, 'out4'), parseBackupKey(KEY)),
      /backup archive/i
    )
  })

  test('a short key is rejected before anything is dumped', () => {
    assert.throws(() => parseBackupKey('deadbeef'), /64 hex/)
    assert.throws(() => parseBackupKey(''), /64 hex/)
  })
})

describe('databaseNameFromUri', () => {
  test('reads the database out of a URI', () => {
    assert.equal(databaseNameFromUri('mongodb://localhost:27018/corporate-lms'), 'corporate-lms')
    assert.equal(databaseNameFromUri('mongodb://u:p@host:27017/lms?authSource=admin'), 'lms')
    assert.equal(databaseNameFromUri('mongodb+srv://u:p@cluster.example.net/lms?retryWrites=true'), 'lms')
  })

  test('refuses a URI with no database — dumping every database on a shared server is not the intent', () => {
    assert.throws(() => databaseNameFromUri('mongodb://localhost:27017'), /no database name/)
    assert.throws(() => databaseNameFromUri('mongodb://localhost:27017/?a=b'), /no database name/)
  })

  test('withoutDatabase keeps the host and the query string', () => {
    assert.equal(withoutDatabase('mongodb://localhost:27018/corporate-lms'), 'mongodb://localhost:27018/')
    assert.equal(
      withoutDatabase('mongodb://u:p@host:27017/lms?authSource=admin'),
      'mongodb://u:p@host:27017/?authSource=admin'
    )
    assert.equal(withoutDatabase('mongodb://localhost:27017'), 'mongodb://localhost:27017/')
  })

  test('does not print the password in its error', () => {
    assert.throws(
      () => databaseNameFromUri('mongodb://user:hunter2@localhost:27017'),
      (error) => {
        assert.ok(!error.message.includes('hunter2'))
        return true
      }
    )
  })
})

describe('retention sweep', () => {
  let dir
  let store
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'backup-prune-test-'))
    store = new FakeStore(dir)
  })
  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const day = 24 * 60 * 60 * 1000
  const now = new Date('2026-09-08T03:20:00Z')

  test('deletes only what is past the window', async () => {
    for (const [key, ageDays] of [
      ['mongo/a', 45],
      ['mongo/b', 31],
      ['mongo/c', 29],
      ['mongo/d', 0],
    ]) {
      store.meta.set(key, { size: 1, lastModified: new Date(now.getTime() - ageDays * day) })
    }
    const pruned = await pruneOldBackups({ storage: store, retentionDays: 30, now })
    assert.deepEqual(pruned.sort(), ['mongo/a', 'mongo/b'])
    assert.deepEqual(
      (await store.listObjects('mongo/')).map((object) => object.key).sort(),
      ['mongo/c', 'mongo/d']
    )
  })

  test('never deletes the last archive, however old it is', async () => {
    store.meta.clear()
    store.meta.set('mongo/ancient', { size: 1, lastModified: new Date(now.getTime() - 900 * day) })
    assert.deepEqual(await pruneOldBackups({ storage: store, retentionDays: 30, now }), [])
  })

  test('keeps the newest even when every archive is expired', async () => {
    store.meta.clear()
    store.meta.set('mongo/old-1', { size: 1, lastModified: new Date(now.getTime() - 200 * day) })
    store.meta.set('mongo/old-2', { size: 1, lastModified: new Date(now.getTime() - 100 * day) })
    assert.deepEqual(await pruneOldBackups({ storage: store, retentionDays: 30, now }), ['mongo/old-1'])
  })
})

const drillSkip = toolsInstalled()
  ? false
  : 'mongodump/mongorestore not installed — install the MongoDB Database Tools to run the restore drill'

describe('restore drill (dump -> encrypt -> store -> decrypt -> restore)', { skip: drillSkip }, () => {
  let dir
  let store
  let client

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'backup-drill-'))
    store = new FakeStore(dir)
    client = new MongoClient(env.MONGO_URI)
    await client.connect()
    // Scratch databases, never the deployment's own: this test drops them.
    await client.db(SOURCE_DB).dropDatabase()
    await client.db(TARGET_DB).dropDatabase()
    const employees = client.db(SOURCE_DB).collection('employees')
    await employees.insertMany(SEED)
    await employees.createIndex({ jshshir: 1 }, { unique: true, name: 'jshshir_unique' })
  })

  after(async () => {
    await client.db(SOURCE_DB).dropDatabase()
    await client.db(TARGET_DB).dropDatabase()
    await client.close()
    await rm(dir, { recursive: true, force: true })
  })

  test('a backup lands in the store under a sortable key', async () => {
    const result = await createBackup({
      storage: store,
      mongoUri: uriFor(SOURCE_DB),
      encryptionKey: KEY,
      now: new Date('2026-09-08T03:20:00Z'),
    })
    assert.equal(result.key, `mongo/${SOURCE_DB}-2026-09-08T03-20-00Z.archive.gz.enc`)
    assert.ok(result.size > 0)

    const listed = await listBackups({ storage: store })
    assert.equal(listed.length, 1)
    assert.equal(listed[0].key, result.key)
  })

  test('the stored archive is not readable without the key', async () => {
    const [{ key }] = await listBackups({ storage: store })
    const raw = await readFile(store.pathFor(key))
    assert.ok(!raw.includes(Buffer.from('12345678901234')), 'a JSHSHIR is readable in the stored archive')
    assert.equal(raw.subarray(0, 8).toString('ascii'), 'QLMSBK01')
  })

  test('restoring into a scratch database reproduces the data and its indexes', async () => {
    const [{ key }] = await listBackups({ storage: store })
    await restoreBackup({
      objectKey: key,
      targetUri: uriFor(TARGET_DB),
      storage: store,
      encryptionKey: KEY,
      sourceUri: uriFor(SOURCE_DB),
    })

    const restored = client.db(TARGET_DB).collection('employees')
    const docs = await restored.find({}).sort({ _id: 1 }).toArray()
    assert.equal(docs.length, SEED.length)
    assert.equal(docs[0].jshshir, SEED[0].jshshir)
    assert.deepEqual(docs[0].joinedAt, SEED[0].joinedAt)
    assert.deepEqual(docs[0].tags, ['a', 'b'])
    assert.equal(docs[0].manager, null)
    assert.equal(docs[1].jshshir, SEED[1].jshshir)

    // The reason for shelling out to mongodump rather than exporting JSON:
    // a restore that loses a unique index restores a database that will
    // happily accept duplicates tomorrow.
    const indexes = await restored.indexes()
    const unique = indexes.find((index) => index.name === 'jshshir_unique')
    assert.ok(unique, 'the unique index did not survive the round trip')
    assert.equal(unique.unique, true)
  })

  test('a restore refuses an archive encrypted under a different key', async () => {
    const [{ key }] = await listBackups({ storage: store })
    await assert.rejects(() =>
      restoreBackup({
        objectKey: key,
        targetUri: uriFor(TARGET_DB),
        storage: store,
        encryptionKey: generateBackupKey(),
        sourceUri: uriFor(SOURCE_DB),
      })
    )
  })
})
