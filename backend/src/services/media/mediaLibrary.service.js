import { MediaAsset } from '../../models/mediaAsset.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'
import { mediaUsageService } from './mediaUsage.service.js'

/**
 * The media library (9.5).
 *
 * What it is for: an author who has already uploaded the company logo, or
 * the safety diagram that belongs in four lessons, should not have to find
 * the file on their laptop again. Before this, every image was uploaded
 * once per place it appeared, and nobody could answer "is this still used"
 * — so nothing was ever deleted and the bucket only grew.
 */
const defaultStorage = () => new S3StorageProvider(env.S3_BUCKET_IMAGES)

// A folder is a label, so it is normalised like one: no leading or
// trailing slashes, no `..`, a sane depth. `brand/2026` is a folder;
// `../../etc` is somebody testing.
export function normalizeFolder(raw) {
  const cleaned = String(raw ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .slice(0, 3)
    .join('/')
  return cleaned.slice(0, 120)
}

function toPublicAsset(asset) {
  return {
    id: asset._id.toString(),
    key: asset.key,
    url: asset.url,
    name: asset.name,
    folder: asset.folder,
    kind: asset.kind,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    // The grid reads this and falls back to `url` — assets uploaded before
    // 9.6 have no thumbnail, and re-encoding the whole bucket to give them
    // one is not worth a migration.
    thumbUrl: asset.thumbUrl || '',
    originalSize: asset.originalSize,
    createdAt: asset.createdAt,
  }
}

export const mediaLibraryService = {
  /**
   * Records an upload in the library.
   *
   * Called from the upload path and deliberately forgiving: a failure here
   * must not fail the upload, because the bytes are already stored and the
   * caller (a course cover, a lesson block) is about to reference them.
   * An unregistered object is not lost — it is simply not listed, and the
   * orphan sweep leaves anything referenced alone.
   */
  async register(
    actor,
    { key, url, name, mimeType, size, folder, width, height, thumbKey, thumbUrl, originalMimeType, originalSize }
  ) {
    try {
      const asset = await MediaAsset.findOneAndUpdate(
        { key },
        {
          $set: {
            bucket: env.S3_BUCKET_IMAGES,
            url,
            name: String(name ?? '').slice(0, 200),
            mimeType,
            size,
            folder: normalizeFolder(folder),
            uploadedBy: actor?.id ?? null,
            ...(width ? { width } : {}),
            ...(height ? { height } : {}),
            ...(thumbKey ? { thumbKey } : {}),
            ...(thumbUrl ? { thumbUrl } : {}),
            ...(originalMimeType ? { originalMimeType } : {}),
            ...(originalSize ? { originalSize } : {}),
          },
          $setOnInsert: { kind: 'IMAGE' },
        },
        { new: true, upsert: true }
      )
      return toPublicAsset(asset)
    } catch (error) {
      logger.warn('Could not register a media asset', { key, error: error.message })
      return null
    }
  },

  async list({ folder, search, page = 1, limit = 40 }) {
    const filter = {}
    if (folder !== undefined && folder !== '') filter.folder = normalizeFolder(folder)
    if (search) {
      // A plain regex on the name, escaped: the collection is small and a
      // `$text` index would not match a partial filename, which is how
      // people actually search for "logo-2".
      filter.name = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    }

    const skip = (Math.max(1, page) - 1) * limit
    const [items, total] = await Promise.all([
      MediaAsset.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MediaAsset.countDocuments(filter),
    ])
    return { items: items.map(toPublicAsset), total, page: Math.max(1, page), limit }
  },

  /** The folders that actually contain something. */
  async folders() {
    const names = await MediaAsset.distinct('folder')
    return names.filter(Boolean).sort()
  },

  async usage(id) {
    const asset = await MediaAsset.findById(id).lean()
    if (!asset) throw ApiError.notFound('Asset not found')
    return { asset: toPublicAsset(asset), uses: await mediaUsageService.find({ url: asset.url, key: asset.key }) }
  },

  async update(actor, id, { name, folder }) {
    const asset = await MediaAsset.findById(id)
    if (!asset) throw ApiError.notFound('Asset not found')
    if (name !== undefined) asset.name = String(name).slice(0, 200)
    if (folder !== undefined) asset.folder = normalizeFolder(folder)
    await asset.save()
    return toPublicAsset(asset)
  },

  /**
   * Deletes the row and the bytes — but only once nothing points at the
   * file.
   *
   * The guard is the reason the library is worth having. Deleting an image
   * that is still a course cover leaves a broken image on a page nobody is
   * looking at, and the person who deletes it is never the person who finds
   * out. `force` exists for the case where the reference is itself the
   * problem, and it is recorded in the audit log.
   */
  async remove(actor, id, { force = false, storage = defaultStorage() } = {}) {
    const asset = await MediaAsset.findById(id)
    if (!asset) throw ApiError.notFound('Asset not found')

    const uses = await mediaUsageService.find({ url: asset.url, key: asset.key })
    if (uses.length && !force) {
      throw ApiError.badRequest('This file is still in use', 'MEDIA_IN_USE', { uses })
    }

    await MediaAsset.deleteOne({ _id: asset._id })
    if (asset.thumbKey) await storage.deleteObject(asset.thumbKey).catch(() => {})
    await storage.deleteObject(asset.key).catch((error) => {
      // The row is gone, so the library is right; an object left behind is
      // the orphan sweep's job rather than a reason to fail the request.
      logger.warn('Could not delete a media object', { key: asset.key, error: error.message })
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'MEDIA_DELETED',
      entity: 'MediaAsset',
      entityId: String(id),
      metadata: { key: asset.key, forced: Boolean(uses.length && force), uses: uses.length },
    })

    return { id: String(id), deletedUses: uses.length }
  },
}
