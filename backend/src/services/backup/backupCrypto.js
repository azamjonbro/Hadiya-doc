/**
 * Envelope format for an encrypted backup archive.
 *
 * A database dump is the one artifact that contains every JSHSHIR, every
 * password hash and every proctoring record at once, and it leaves the box
 * to object storage that is not part of the app's threat model (a shared
 * MinIO, someone else's S3). So it is encrypted before it is uploaded,
 * never after it arrives.
 *
 * AES-256-GCM rather than CBC: a backup nobody can verify is a backup that
 * silently restores half a database after a truncated upload. The auth tag
 * turns that into a loud failure at decrypt time.
 *
 * Layout:
 *   [0, 8)            magic "QLMSBK01" — so a wrong file fails with a
 *                     sentence instead of a garbage-key error
 *   [8, 20)           96-bit IV, fresh per archive
 *   [20, size-16)     ciphertext
 *   [size-16, size)   GCM auth tag
 *
 * The tag lives at the end because it only exists once the whole stream has
 * been read; putting it in the header would mean buffering the entire dump
 * in memory, which is exactly what a multi-gigabyte archive must not do.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

export const MAGIC = Buffer.from('QLMSBK01', 'ascii')
const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = MAGIC.length + IV_BYTES
const KEY_BYTES = 32

export function parseBackupKey(hexKey) {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey ?? '')) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }
  return Buffer.from(hexKey, 'hex')
}

export function generateBackupKey() {
  return randomBytes(KEY_BYTES).toString('hex')
}

export async function encryptFile(plainPath, cipherPath, key) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const out = createWriteStream(cipherPath)

  out.write(Buffer.concat([MAGIC, iv]))
  await pipeline(createReadStream(plainPath), cipher, out, { end: false })

  // getAuthTag is only valid after the cipher has flushed, which pipeline
  // above guarantees; `end: false` kept the file open so it can be appended.
  const tag = cipher.getAuthTag()
  await new Promise((resolve, reject) => {
    out.end(tag, (error) => (error ? reject(error) : resolve()))
  })
}

export async function decryptFile(cipherPath, plainPath, key) {
  const { size } = await stat(cipherPath)
  if (size < HEADER_BYTES + TAG_BYTES) {
    throw new Error('Backup archive is truncated — smaller than its own envelope')
  }

  const handle = await open(cipherPath, 'r')
  let iv
  let tag
  try {
    const header = Buffer.alloc(HEADER_BYTES)
    await handle.read(header, 0, HEADER_BYTES, 0)
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Not a Qo\'llanma backup archive (bad magic header)')
    }
    iv = header.subarray(MAGIC.length)

    tag = Buffer.alloc(TAG_BYTES)
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES)
  } finally {
    await handle.close()
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  // `end` is inclusive in createReadStream, so this stops one byte before
  // the tag rather than feeding the tag back in as ciphertext.
  await pipeline(
    createReadStream(cipherPath, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
    decipher,
    createWriteStream(plainPath)
  )
}
