import { Video } from '../../models/video.model.js'
import { Material } from '../../models/material.model.js'
import { ScormPackage } from '../../models/scormPackage.model.js'
import { MediaAsset } from '../../models/mediaAsset.model.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { mediaUsageService } from './mediaUsage.service.js'

/**
 * The orphan sweep (9.5) — the debt `course.service.js` has carried since
 * the trash was built.
 *
 * Deleting a course removes its rows and leaves its bytes: video originals,
 * HLS renditions, materials, SCORM packages, images. The comment there says
 * why ("removing them means walking a whole key prefix per video and is not
 * something a half-finished pass should be left in the middle of"), and it
 * is right — which is why this is a separate, restartable pass rather than
 * part of the delete.
 *
 * Two rules make it safe to run at all:
 *
 *   1. **A grace period.** An object younger than
 *      MEDIA_ORPHAN_GRACE_DAYS is never touched. Uploads write the object
 *      first and the row second, so a sweep racing an upload would delete a
 *      file whose row appears a moment later — the one failure mode that
 *      loses somebody's work rather than reclaiming space.
 *   2. **Dry run by default.** Every caller has to ask for deletion
 *      explicitly. A report is worth reading; a sweep that deleted
 *      something surprising is worth nothing.
 */
const GRACE_DAYS = Number(env.MEDIA_ORPHAN_GRACE_DAYS ?? 7)

const storageFor = (bucket) => new S3StorageProvider(bucket)

function olderThanGrace(object, now, graceDays) {
  const modified = object.lastModified ? new Date(object.lastModified).getTime() : 0
  if (!modified) return false
  return now - modified > graceDays * 24 * 60 * 60 * 1000
}

/** `processed/<videoId>/...` → the id, or null. */
function videoIdFromProcessedKey(key) {
  const match = /^processed\/([a-f\d]{24})\//i.exec(key)
  return match ? match[1] : null
}

/** `packages/<packageId>/...` → the id, or null. */
function packageIdFromKey(key) {
  const match = /^packages\/([a-f\d]{24})\//i.exec(key)
  return match ? match[1] : null
}

/**
 * What is in storage that nothing references any more.
 *
 * One pass per bucket, each with its own idea of what "referenced" means —
 * a key held in a field (originals, materials, SCORM archives), a prefix
 * named after a row's id (renditions, SCORM packages), or a URL written
 * into any of a dozen places (images).
 */
export async function findOrphans({ now = Date.now(), graceDays = GRACE_DAYS, storages = {} } = {}) {
  const report = {}
  // A bucket that cannot be listed is reported as an error for that area
  // rather than failing the whole sweep: storage being unreachable for one
  // bucket (a policy, a typo in an env var, MinIO restarting) should not
  // hide the answer for the other four.
  const errors = {}
  const guard = async (area, run) => {
    try {
      report[area] = await run()
    } catch (error) {
      report[area] = []
      errors[area] = error.message
      logger.warn('Orphan scan failed for one area', { area, error: error.message })
    }
  }

  // --- Renditions and captions: processed/<videoId>/ ---
  await guard('processed', async () => {
    const storage = storages.processed ?? storageFor(env.S3_BUCKET_PROCESSED)
    const objects = await storage.listObjects('processed/')
    const ids = [...new Set(objects.map((object) => videoIdFromProcessedKey(object.key)).filter(Boolean))]
    const alive = new Set(
      (await Video.find({ _id: { $in: ids } }, { _id: 1 }).lean()).map((row) => String(row._id))
    )
    return objects.filter((object) => {
      const id = videoIdFromProcessedKey(object.key)
      // An object whose key shape we do not recognise is left alone: this
      // sweep deletes what it understands, not what it cannot explain.
      if (!id) return false
      return !alive.has(id) && olderThanGrace(object, now, graceDays)
    })
  })

  // --- Video originals: the key is held in Video.originalKey ---
  await guard('originals', async () => {
    const storage = storages.originals ?? storageFor(env.S3_BUCKET_ORIGINALS)
    const objects = await storage.listObjects('')
    const referenced = new Set(
      (await Video.find({ originalKey: { $nin: ['', null] } }, { originalKey: 1 }).lean()).map((row) => row.originalKey)
    )
    return objects.filter((object) => !referenced.has(object.key) && olderThanGrace(object, now, graceDays))
  })

  // --- Materials ---
  await guard('materials', async () => {
    const storage = storages.materials ?? storageFor(env.S3_BUCKET_MATERIALS)
    const objects = await storage.listObjects('')
    const referenced = new Set(
      (await Material.find({ key: { $nin: ['', null] } }, { key: 1 }).lean()).map((row) => row.key)
    )
    return objects.filter((object) => !referenced.has(object.key) && olderThanGrace(object, now, graceDays))
  })

  // --- SCORM: extracted packages by prefix, archives by key ---
  await guard('scorm', async () => {
    const storage = storages.scorm ?? storageFor(env.S3_BUCKET_SCORM)
    const objects = await storage.listObjects('')
    const packages = await ScormPackage.find({}, { zipKey: 1 }).lean()
    const aliveIds = new Set(packages.map((row) => String(row._id)))
    const zipKeys = new Set(packages.map((row) => row.zipKey).filter(Boolean))
    return objects.filter((object) => {
      if (!olderThanGrace(object, now, graceDays)) return false
      const packageId = packageIdFromKey(object.key)
      if (packageId) return !aliveIds.has(packageId)
      if (object.key.startsWith('zips/')) return !zipKeys.has(object.key)
      return false
    })
  })

  // --- Images: referenced by a URL somewhere, or held in the library ---
  await guard('images', async () => {
    const storage = storages.images ?? storageFor(env.S3_BUCKET_IMAGES)
    const objects = await storage.listObjects('')
    const { urls, keys } = await mediaUsageService.referencedImages()
    // A library asset that nothing uses is *not* an orphan: an author
    // uploaded it to use later, and deleting it would be the library
    // eating its own contents.
    const assets = await MediaAsset.find({}, { key: 1, thumbKey: 1 }).lean()
    const libraryKeys = new Set()
    assets.forEach((row) => {
      libraryKeys.add(row.key)
      // A thumbnail is not referenced anywhere by itself (9.6) — the row
      // that owns it is the reference, and sweeping it would leave the
      // library showing full-size images for no reason.
      if (row.thumbKey) libraryKeys.add(row.thumbKey)
    })
    // The stored references are URLs; the tail after the bucket name is the
    // key, whatever host the URL was built with.
    const referencedKeys = new Set([...keys])
    urls.forEach((url) => {
      const match = new RegExp(`${env.S3_BUCKET_IMAGES}/(.+)$`).exec(url)
      if (match) referencedKeys.add(match[1])
    })

    return objects.filter(
      (object) =>
        !libraryKeys.has(object.key) &&
        !referencedKeys.has(object.key) &&
        olderThanGrace(object, now, graceDays)
    )
  })

  return Object.keys(errors).length ? Object.assign(report, { errors }) : report
}

const BUCKET_BY_AREA = {
  processed: () => env.S3_BUCKET_PROCESSED,
  originals: () => env.S3_BUCKET_ORIGINALS,
  materials: () => env.S3_BUCKET_MATERIALS,
  scorm: () => env.S3_BUCKET_SCORM,
  images: () => env.S3_BUCKET_IMAGES,
}

/**
 * The sweep. Reports by default; deletes only when told to.
 *
 * @returns {Promise<{areas: object, totalObjects: number, totalBytes: number, deleted: number}>}
 */
export async function sweepOrphans({ apply = false, actor = null, graceDays = GRACE_DAYS, storages = {} } = {}) {
  const orphans = await findOrphans({ graceDays, storages })

  const areas = {}
  let totalObjects = 0
  let totalBytes = 0
  let deleted = 0

  for (const [area, objects] of Object.entries(orphans)) {
    // `errors` rides along in the report; it is a map of messages, not a
    // list of objects.
    if (area === 'errors') continue
    const bytes = objects.reduce((sum, object) => sum + (object.size ?? 0), 0)
    areas[area] = {
      objects: objects.length,
      bytes,
      // A handful of examples, so a report can be read without dumping
      // several thousand keys into a log line.
      sample: objects.slice(0, 5).map((object) => object.key),
    }
    totalObjects += objects.length
    totalBytes += bytes

    if (apply && objects.length) {
      const storage = storages[area] ?? storageFor(BUCKET_BY_AREA[area]())
      for (const object of objects) {
        try {
          await storage.deleteObject(object.key)
          deleted += 1
        } catch (error) {
          logger.warn('Could not delete an orphaned object', { area, key: object.key, error: error.message })
        }
      }
    }
  }

  const result = {
    areas,
    totalObjects,
    totalBytes,
    deleted,
    applied: Boolean(apply),
    graceDays,
    ...(orphans.errors ? { errors: orphans.errors } : {}),
  }
  logger.info('Media orphan sweep finished', result)

  if (apply && deleted) {
    await auditLogRepository
      .record({
        actor: actor?.id ?? null,
        action: 'MEDIA_ORPHANS_DELETED',
        entity: 'MediaAsset',
        entityId: null,
        metadata: { deleted, totalBytes, areas },
      })
      .catch(() => {})
  }

  return result
}
