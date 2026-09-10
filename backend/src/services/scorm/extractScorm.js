import JSZip from 'jszip'
import path from 'node:path'
import { ScormPackage } from '../../models/scormPackage.model.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { errorMessage } from '../../utils/errorMessage.js'
import { parseManifest } from './scormManifest.js'
import { contentTypeFor, packagePrefix, safeRelativePath } from './scormFiles.js'

const scormStorage = new S3StorageProvider(env.S3_BUCKET_SCORM)

/**
 * A package is a zip of a website, and both of those numbers need a ceiling.
 *
 * The upload size is capped before the zip is even stored
 * (SCORM_MAX_FILE_SIZE_MB), but a zip bomb is small on the way in and
 * enormous on the way out — a few megabytes of zeros expands to gigabytes,
 * and the worker would fill the disk of a box that also hosts six other
 * sites. So the *uncompressed* total is capped as well, at eight times the
 * upload ceiling, which is far above any real course and far below harm.
 */
const MAX_FILES = 5000
const MAX_UNCOMPRESSED_BYTES = env.SCORM_MAX_FILE_SIZE_MB * 8 * 1024 * 1024
// Files are uploaded a handful at a time: a course of six hundred small
// images is six hundred round trips, and doing them one after another makes
// a two-minute job out of a ten-second one. Eight rather than eighty
// because MinIO is on the same little box as everything else.
const UPLOAD_CONCURRENCY = 8

async function toBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/**
 * Which entry is the manifest, and what prefix everything hangs off.
 *
 * Half the exports in the world are zipped with a wrapper folder — the
 * manifest is at `My Course/imsmanifest.xml`, not at the root — and a
 * learner should not have to care which button the author pressed in their
 * zip tool. The shallowest manifest wins, and its directory becomes the
 * root: a package that contains another package inside it (Storyline
 * sometimes ships one as an asset) must not have the inner one chosen.
 */
export function findManifestEntry(names) {
  const candidates = names.filter((name) => name.toLowerCase().endsWith('imsmanifest.xml'))
  if (!candidates.length) return null
  candidates.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)
  const manifestPath = candidates[0]
  const directory = manifestPath.slice(0, manifestPath.length - 'imsmanifest.xml'.length)
  return { manifestPath, prefix: directory }
}

/** The href without its query string — what has to exist as a file. */
function hrefFile(href) {
  return String(href ?? '').split(/[?#]/)[0]
}

async function inBatches(items, size, worker) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker))
  }
}

/**
 * Unpacks one uploaded package into the SCORM bucket and reads its manifest.
 *
 * Runs in the worker, not in the request: a 300 MB zip takes long enough
 * that an author would be staring at a spinner, and the upload has already
 * succeeded by the time this starts — which is why failure is recorded on
 * the row rather than thrown at anybody.
 */
export async function extractScormPackage(packageId) {
  const row = await ScormPackage.findById(packageId)
  if (!row) {
    logger.warn('SCORM extraction skipped: package is gone', { packageId: String(packageId) })
    return null
  }

  await ScormPackage.updateOne({ _id: row._id }, { $set: { processingStatus: 'EXTRACTING', processingError: '' } })

  try {
    const zip = await JSZip.loadAsync(await toBuffer(await scormStorage.getObject(row.zipKey)))
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir)

    const manifest = findManifestEntry(names)
    if (!manifest) {
      throw new Error('The archive has no imsmanifest.xml — this is not a SCORM package')
    }

    const parsed = parseManifest(await zip.files[manifest.manifestPath].async('string'))

    const entries = names
      .filter((name) => name.startsWith(manifest.prefix))
      .map((name) => ({ name, relative: safeRelativePath(name.slice(manifest.prefix.length)) }))
      // A rejected path is dropped rather than failing the import: the
      // usual cause is a `__MACOSX/` resource fork or a stray absolute
      // path, and refusing a whole course over one junk entry helps nobody.
      // A traversal attempt cannot reach anything either way — this is the
      // check that makes sure of it (scormFiles.js).
      .filter((entry) => entry.relative)

    if (!entries.length) throw new Error('The archive is empty')
    if (entries.length > MAX_FILES) throw new Error(`The package has more than ${MAX_FILES} files`)

    const launchFile = hrefFile(parsed.launchHref)
    if (launchFile && !entries.some((entry) => entry.relative === launchFile)) {
      throw new Error(`The manifest points at ${launchFile}, which is not in the archive`)
    }

    const prefix = packagePrefix(row._id.toString())
    let totalBytes = 0

    await inBatches(entries, UPLOAD_CONCURRENCY, async (entry) => {
      const body = await zip.files[entry.name].async('nodebuffer')
      totalBytes += body.length
      if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('The package expands to more than the allowed size')
      }
      await scormStorage.putObject(prefix + entry.relative, body, contentTypeFor(entry.relative))
    })

    const updated = await ScormPackage.findByIdAndUpdate(
      row._id,
      {
        $set: {
          processingStatus: 'READY',
          processingError: '',
          baseKey: prefix,
          launchHref: parsed.launchHref || 'index.html',
          version: parsed.version,
          manifestIdentifier: parsed.identifier,
          masteryScore: parsed.masteryScore,
          fileCount: entries.length,
          totalBytes,
          // The manifest's own title only fills in a placeholder: an author
          // who typed a title in our form meant that one.
          ...(row.title === '' || row.title === path.basename(row.zipKey) ? { title: parsed.title || row.title } : {}),
        },
      },
      { new: true }
    )

    logger.info('SCORM package extracted', {
      packageId: String(row._id),
      version: parsed.version,
      files: entries.length,
      launchHref: updated.launchHref,
    })
    return updated
  } catch (error) {
    const reason = errorMessage(error)
    await ScormPackage.updateOne(
      { _id: row._id },
      { $set: { processingStatus: 'FAILED', processingError: reason.slice(0, 500) } }
    )
    logger.warn('SCORM extraction failed', { packageId: String(row._id), error: reason })
    // Rethrown so BullMQ records the failure and retries; the row already
    // says what happened, so a retry that fails again changes nothing.
    throw error
  }
}
