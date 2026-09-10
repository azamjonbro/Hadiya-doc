import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { ScormPackage } from '../../models/scormPackage.model.js'
import { ScormState } from '../../models/scormState.model.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'
import { openTopic, visibleRows, nextOrder } from '../courses/contentItem.js'
import { canManageCourses } from '../courses/coursePermissions.js'
import { courseCompletionService } from '../courses/courseCompletion.service.js'
import { enqueueScormExtraction } from '../../jobs/scormQueue.js'
import { contentTypeFor, packagePrefix, safeRelativePath } from './scormFiles.js'
import { signLaunchToken } from './scormToken.js'
import { scormRuntimeService } from './scormRuntime.service.js'

const scormStorage = new S3StorageProvider(env.S3_BUCKET_SCORM)
const MAX_BYTES = env.SCORM_MAX_FILE_SIZE_MB * 1024 * 1024

function toPublicPackage(row) {
  return {
    id: row._id.toString(),
    topicId: row.topicId.toString(),
    courseId: row.courseId.toString(),
    title: row.title,
    description: row.description,
    version: row.version,
    status: row.status,
    required: row.required,
    order: row.order,
    processingStatus: row.processingStatus,
    processingError: row.processingError,
    fileCount: row.fileCount,
    totalBytes: row.totalBytes,
    masteryScore: row.masteryScore,
    manifestIdentifier: row.manifestIdentifier,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** 1.2 wants `HHHH:MM:SS.SS`; 2004 wants an ISO 8601 duration. */
function formatTotalTime(version, seconds) {
  const total = Math.max(0, Math.round(seconds ?? 0))
  if (version === '2004') {
    return `PT${Math.floor(total / 3600)}H${Math.floor((total % 3600) / 60)}M${total % 60}S`
  }
  const hours = String(Math.floor(total / 3600)).padStart(4, '0')
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const secs = String(total % 60).padStart(2, '0')
  return `${hours}:${minutes}:${secs}.00`
}

/** The single 1.2 status, rebuilt from the two facts we store. */
function lessonStatusOf(state) {
  if (state.completionStatus === 'completed') {
    if (state.successStatus === 'passed') return 'passed'
    if (state.successStatus === 'failed') return 'failed'
    return 'completed'
  }
  if (state.completionStatus === 'incomplete') return 'incomplete'
  return 'not attempted'
}

async function loadVisible(actor, id) {
  const row = await ScormPackage.findById(id)
  if (!row) throw ApiError.notFound('SCORM package not found')
  // The same answer the other content types give about a draft: it does not
  // exist, rather than "you may not see it".
  if (row.status !== 'PUBLISHED' && !canManageCourses(actor)) {
    throw ApiError.notFound('SCORM package not found')
  }
  return row
}

export const scormPackageService = {
  async listByTopic(actor, topicId) {
    const { canManage } = await openTopic(actor, topicId)
    const rows = visibleRows(await ScormPackage.find({ topicId }).sort({ order: 1 }), canManage)
    return rows.map(toPublicPackage)
  },

  async getById(actor, id) {
    return toPublicPackage(await loadVisible(actor, id))
  },

  /**
   * Stores the zip and hands the unpacking to the worker.
   *
   * The request does not wait for extraction: a 300 MB course takes long
   * enough that the browser would time out, and the upload itself has
   * already succeeded. The row exists immediately with PENDING on it, so
   * the author sees the package appear and watches it become ready — the
   * same shape as a video upload.
   */
  async upload(actor, topicId, meta, file) {
    const topic = await topicRepository.findById(topicId)
    if (!topic) throw ApiError.notFound('Topic not found')
    if (!file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED')
    if (file.size > MAX_BYTES) {
      throw ApiError.badRequest(`Package must be ${env.SCORM_MAX_FILE_SIZE_MB}MB or smaller`, 'FILE_TOO_LARGE', {
        limit: env.SCORM_MAX_FILE_SIZE_MB,
      })
    }

    // Magic bytes, not the filename or the declared type — the same rule
    // every other upload path here follows.
    const detected = await fileTypeFromBuffer(file.buffer)
    if (!detected || detected.ext !== 'zip') {
      throw ApiError.badRequest('A SCORM package is a .zip archive', 'UNSUPPORTED_FILE_TYPE')
    }

    const zipKey = `zips/${crypto.randomUUID()}.zip`
    await scormStorage.putObject(zipKey, file.buffer, 'application/zip')

    const row = await ScormPackage.create({
      topicId,
      courseId: topic.courseId,
      // The manifest usually carries a better title, and the extractor
      // fills it in when the author left this empty.
      title: meta.title?.trim() || '',
      description: meta.description ?? '',
      required: meta.required !== false,
      order: meta.order ?? (await nextOrder(topicId)),
      zipKey,
      processingStatus: 'PENDING',
      createdBy: actor.id,
    })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'SCORM_UPLOADED',
      entity: 'ScormPackage',
      entityId: row._id.toString(),
      metadata: { topicId: String(topicId), bytes: file.size, filename: file.originalname },
    })

    await enqueueScormExtraction(row._id).catch((error) => {
      // The zip is stored and the row exists; only the unpacking is lost,
      // and that is re-triggerable. Failing the upload here would throw
      // away a 300 MB transfer over a Redis hiccup.
      logger.warn('Could not enqueue SCORM extraction', { packageId: String(row._id), error: error.message })
    })

    return toPublicPackage(row)
  },

  /** Re-runs extraction on an existing upload — for a FAILED package. */
  async reprocess(actor, id) {
    const row = await ScormPackage.findById(id)
    if (!row) throw ApiError.notFound('SCORM package not found')
    if (!row.zipKey) throw ApiError.badRequest('This package has no stored archive', 'SCORM_NO_ARCHIVE')
    await ScormPackage.updateOne({ _id: row._id }, { $set: { processingStatus: 'PENDING', processingError: '' } })
    await enqueueScormExtraction(row._id)
    return toPublicPackage(await ScormPackage.findById(id))
  },

  async update(actor, id, payload) {
    const existing = await ScormPackage.findById(id)
    if (!existing) throw ApiError.notFound('SCORM package not found')

    if (payload.status === 'PUBLISHED' && existing.processingStatus !== 'READY') {
      // Publishing a package that has not unpacked would put an item in the
      // curriculum that cannot open, and the completion rule would count it
      // against every learner on the course.
      throw ApiError.badRequest('The package is still being prepared', 'SCORM_NOT_READY', {
        processingStatus: existing.processingStatus,
      })
    }

    const updated = await ScormPackage.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedBy: actor.id } },
      { new: true, runValidators: true }
    )

    await auditLogRepository.record({
      actor: actor.id,
      action: 'SCORM_UPDATED',
      entity: 'ScormPackage',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })

    // Same rule as videos and lessons: only a change that could move the
    // completion answer walks the learners.
    const nowPublished = existing.status !== 'PUBLISHED' && updated.status === 'PUBLISHED'
    const withdrawn = existing.status === 'PUBLISHED' && updated.status !== 'PUBLISHED'
    const requirementChanged = payload.required !== undefined && payload.required !== existing.required
    if (nowPublished || withdrawn || requirementChanged) {
      await courseCompletionService.evaluateCourse(updated.courseId).catch((error) => {
        logger.warn('Re-evaluating completion after a SCORM change failed', { packageId: id, error: error.message })
      })
    }

    return toPublicPackage(updated)
  },

  async remove(actor, id) {
    const existing = await ScormPackage.findById(id)
    if (!existing) throw ApiError.notFound('SCORM package not found')

    // A duplicated course points its copy at the same extracted files —
    // gigabytes are not copied to make an editable duplicate of a syllabus
    // (the same rule videos follow). So the objects only go when nothing
    // else references them; otherwise deleting one copy would empty the
    // player in the other.
    const sharedWith = existing.baseKey
      ? await ScormPackage.countDocuments({ _id: { $ne: existing._id }, baseKey: existing.baseKey })
      : 0

    await ScormPackage.deleteOne({ _id: existing._id })

    if (!sharedWith) {
      await this.deleteFiles(existing).catch((error) => {
        // The row is gone either way; an orphaned prefix is 9.5's sweep to
        // clean up, and failing the delete over it would leave the author
        // with a package they cannot remove.
        logger.warn('Could not delete SCORM files', { packageId: id, error: error.message })
      })
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'SCORM_DELETED',
      entity: 'ScormPackage',
      entityId: id,
      metadata: { title: existing.title, sharedFilesKept: Boolean(sharedWith) },
    })

    if (existing.status === 'PUBLISHED') {
      await courseCompletionService.evaluateCourse(existing.courseId).catch(() => {})
    }
  },

  async deleteFiles(row) {
    const objects = await scormStorage.listObjects(row.baseKey || packagePrefix(row._id.toString()))
    for (const object of objects) await scormStorage.deleteObject(object.key)
    if (row.zipKey) await scormStorage.deleteObject(row.zipKey)
  },

  /**
   * What the SPA needs to open the package: a token and the two paths.
   *
   * Paths are relative to the API's own base, never absolute URLs built
   * from request headers — the tunnel in front of this server reports
   * `http` for an `https` request, and an absolute URL built from that
   * breaks under mixed content (fe0e315).
   */
  async launch(actor, id) {
    const row = await loadVisible(actor, id)
    if (row.processingStatus !== 'READY') {
      throw ApiError.badRequest('The package is still being prepared', 'SCORM_NOT_READY', {
        processingStatus: row.processingStatus,
        processingError: row.processingError,
      })
    }

    const token = signLaunchToken(actor.id, row._id)
    return {
      packageId: row._id.toString(),
      version: row.version,
      title: row.title,
      // The player page, on the API origin, is what the SPA frames.
      playerPath: `/scorm/${row._id}/player/${token}`,
      expiresIn: env.SCORM_LAUNCH_TOKEN_TTL,
    }
  },

  /** Everything the player page needs, for one learner and one package. */
  async playerContext(packageId, userId, learnerName) {
    const row = await ScormPackage.findById(packageId)
    if (!row || row.processingStatus !== 'READY') throw ApiError.notFound('SCORM package not found')

    const state = await scormRuntimeService.load(userId, row)
    const token = signLaunchToken(userId, row._id)

    return {
      row,
      token,
      version: row.version,
      masteryScore: row.masteryScore,
      launchUrl: `/api/v1/scorm/${row._id}/f/${token}/${row.launchHref}`,
      statePath: `/api/v1/scorm/${row._id}/state`,
      learner: { id: String(userId), name: learnerName || '' },
      state: {
        cmi: state.cmi ?? {},
        attempts: state.attempts ?? 1,
        location: state.location ?? '',
        suspendData: state.suspendData ?? '',
        completionStatus: state.completionStatus,
        successStatus: state.successStatus,
        lessonStatus: lessonStatusOf(state),
        scoreRaw: state.scoreRaw,
        scoreMin: state.scoreMin,
        scoreMax: state.scoreMax,
        totalTime: formatTotalTime(row.version, state.totalTimeSeconds),
      },
    }
  },

  /**
   * One file out of a package.
   *
   * The path arrives from the package's own markup — a relative link it
   * wrote at export time — so it is re-checked here, not only at extraction
   * time (scormFiles.js).
   */
  async openFile(packageId, rawPath) {
    const row = await ScormPackage.findById(packageId)
    if (!row || row.processingStatus !== 'READY') throw ApiError.notFound('SCORM package not found')

    const relative = safeRelativePath(rawPath)
    if (!relative) throw ApiError.badRequest('Invalid path', 'INVALID_PATH')

    const key = (row.baseKey || packagePrefix(row._id.toString())) + relative
    try {
      const body = await scormStorage.getObject(key)
      return { body, contentType: contentTypeFor(relative) }
    } catch {
      throw ApiError.notFound('File not found in package')
    }
  },

  /** For the state endpoints, which are authorised by the launch token. */
  async byId(packageId) {
    const row = await ScormPackage.findById(packageId)
    if (!row) throw ApiError.notFound('SCORM package not found')
    return row
  },

  async progressFor(userId, packageId) {
    const row = await ScormState.findOne({ userId, packageId }).lean()
    if (!row) {
      return { packageId: String(packageId), completed: false, completionStatus: 'unknown', successStatus: 'unknown' }
    }
    return {
      packageId: String(packageId),
      completed: Boolean(row.completedAt),
      completionStatus: row.completionStatus,
      successStatus: row.successStatus,
      scoreRaw: row.scoreRaw,
      totalTimeSeconds: row.totalTimeSeconds,
      lastAccessAt: row.lastAccessAt,
    }
  },
}
