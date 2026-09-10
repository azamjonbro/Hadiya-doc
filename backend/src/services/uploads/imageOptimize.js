import sharp from 'sharp'
import { logger } from '../../config/logger.js'

/**
 * Images, made cheap to serve (9.6).
 *
 * Everything uploaded here becomes WebP: a photograph off a phone is two to
 * four megabytes of JPEG, and the same image at the size it is actually
 * displayed is a couple of hundred kilobytes. That difference is felt in one
 * place in particular — an employee opening the course catalogue on mobile
 * data, where every cover is downloaded at full camera resolution today.
 *
 * Three rules:
 *
 *   1. **Re-encode, never pass through.** The bytes that come back are ours,
 *      produced by a decoder that has already read the whole file. It is
 *      also what strips EXIF — a photo of a workplace carries GPS
 *      coordinates and a device name, and a course cover has no business
 *      publishing either.
 *   2. **Cap the dimensions.** A 6000px source is never displayed at 6000px;
 *      `withoutEnlargement` means a small logo is left at its own size
 *      rather than blown up.
 *   3. **Keep animation.** An animated GIF converted frame-one-only is a
 *      broken image with a plausible file size, which is worse than not
 *      converting at all.
 */

// Wide enough for a hero banner on a large screen at 2x, small enough that
// nothing here is a multi-megabyte download.
const MAX_DIMENSION = 2560
// A grid of forty library thumbnails should not be forty full-size images.
const THUMB_DIMENSION = 480
// 82 is where WebP stops being visibly lossy for photographs; the file is
// roughly a third of the equivalent JPEG.
const QUALITY = 82

/**
 * @returns {Promise<{buffer: Buffer, mimeType: string, ext: string, width: number, height: number, animated: boolean}>}
 */
export async function optimizeImage(input, { mimeType }) {
  const animated = mimeType === 'image/gif'
  // `animated: true` reads every frame; on a still image it changes nothing.
  const pipeline = sharp(input, { animated })

  const metadata = await pipeline.metadata()
  // An animated image's `height` is the height of the whole filmstrip, so
  // the real frame height comes from `pageHeight`.
  const sourceHeight = metadata.pageHeight ?? metadata.height ?? 0

  const output = await pipeline
    .rotate() // applies the EXIF orientation before it is stripped
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: output.data,
    mimeType: 'image/webp',
    ext: 'webp',
    width: output.info.width,
    height: output.info.pageHeight ?? output.info.height,
    animated,
    sourceWidth: metadata.width ?? 0,
    sourceHeight,
  }
}

/**
 * A small square-ish version for grids and cards.
 *
 * Only for still images: an animated thumbnail in a library grid of forty
 * would be forty videos playing at once, and the first frame of a GIF is a
 * fine thumbnail.
 */
export async function makeThumbnail(input) {
  try {
    const output = await sharp(input, { pages: 1 })
      .rotate()
      .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 74, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    return { buffer: output.data, width: output.info.width, height: output.info.height }
  } catch (error) {
    // A thumbnail is a convenience; the full image is the content. A source
    // sharp cannot make a thumbnail of has already been accepted as an
    // image, so this failing must not fail the upload.
    logger.warn('Could not build an image thumbnail', { error: error.message })
    return null
  }
}

export const IMAGE_LIMITS = { MAX_DIMENSION, THUMB_DIMENSION, QUALITY }
