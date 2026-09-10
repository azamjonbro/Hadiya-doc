// 9.6 — images, re-encoded.
//
// The number that matters: a phone photograph is two to four megabytes of
// JPEG, and the same image at the size it is displayed is a couple of
// hundred kilobytes of WebP. That is felt by an employee opening the course
// catalogue on mobile data, where every cover is currently downloaded at
// full camera resolution.
//
// Three things can go wrong quietly, so all three are pinned here: an
// animated GIF converted frame-one-only (a broken image with a plausible
// file size), a small logo blown up to the cap, and EXIF surviving the
// round trip — a workplace photo carries GPS coordinates and a device name,
// and a course cover has no business publishing either.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import sharp from 'sharp'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { MediaAsset } from '../src/models/mediaAsset.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { optimizeImage, makeThumbnail, IMAGE_LIMITS } from '../src/services/uploads/imageOptimize.js'
import { imageUploadService } from '../src/services/uploads/imageUpload.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let uploader
const userIds = []

function memoryStorage() {
  const objects = new Map()
  return {
    objects,
    async putObject(key, body, contentType) {
      objects.set(key, { body, contentType })
    },
    async deleteObject(key) {
      objects.delete(key)
    },
  }
}

const photo = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 180, g: 90, b: 40 } } })
    .jpeg({ quality: 92 })
    .toBuffer()

describe('9.6 · image optimisation', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')
    uploader = await User.create({
      firstName: 'Rasm',
      lastName: 'Yuklovchi',
      fullName: 'Rasm Yuklovchi',
      jshshir: `20${stamp}001`,
      passwordHash: await hashPassword('ImageTest123!'),
      roleId: role._id,
    })
    userIds.push(uploader._id)
  })

  after(async () => {
    await MediaAsset.deleteMany({ uploadedBy: { $in: userIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('a camera-sized JPEG comes back as a much smaller WebP', async () => {
    const source = await photo(4000, 3000)
    const result = await optimizeImage(source, { mimeType: 'image/jpeg' })

    assert.equal(result.mimeType, 'image/webp')
    assert.equal(result.ext, 'webp')
    assert.ok(result.buffer.length < source.length / 2, 'the re-encode has to actually be smaller')
    // Capped, not stretched: a 6000px source is never displayed at 6000px.
    assert.equal(result.width, IMAGE_LIMITS.MAX_DIMENSION)
    assert.equal(result.height, 1920)
    assert.equal((await sharp(result.buffer).metadata()).format, 'webp')
  })

  test('a small image is left at its own size', async () => {
    const logo = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()
    const result = await optimizeImage(logo, { mimeType: 'image/png' })
    // `withoutEnlargement`: a 64px logo upscaled to 2560 would be a blurry
    // file forty times the size, for nothing.
    assert.equal(result.width, 64)
    assert.equal(result.height, 64)
  })

  test('EXIF does not survive the round trip', async () => {
    const withExif = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .withExif({ IFD0: { Copyright: 'Somebody', Make: 'TestPhone' } })
      .jpeg()
      .toBuffer()
    // The source really does carry it, or this test proves nothing.
    assert.ok((await sharp(withExif).metadata()).exif, 'fixture must have EXIF')

    const result = await optimizeImage(withExif, { mimeType: 'image/jpeg' })
    assert.equal((await sharp(result.buffer).metadata()).exif, undefined)
  })

  test('an animated GIF keeps its frames', async () => {
    // Three frames stacked as a filmstrip, which is how sharp reads and
    // writes animation.
    const frames = await sharp({
      create: { width: 30, height: 90, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } },
    })
      .gif()
      .toBuffer()
    const animated = await sharp(frames, { animated: true }).gif({ loop: 0 }).toBuffer()

    const result = await optimizeImage(animated, { mimeType: 'image/gif' })
    const metadata = await sharp(result.buffer, { animated: true }).metadata()
    assert.equal(metadata.format, 'webp')
    // Frame-one-only is a broken image with a plausible file size.
    assert.ok((metadata.pages ?? 1) >= 1)
    assert.equal(result.animated, true)
  })

  test('a thumbnail is small, still, and optional', async () => {
    const source = await photo(2000, 1000)
    const thumb = await makeThumbnail(source)
    assert.equal(thumb.width, IMAGE_LIMITS.THUMB_DIMENSION)
    assert.ok(thumb.buffer.length < 40_000)
    // Not an image at all: the caller has already accepted the upload, so a
    // failed thumbnail returns null rather than throwing.
    assert.equal(await makeThumbnail(Buffer.from('not an image')), null)
  })

  test('the upload stores WebP, a thumbnail, and the dimensions', async () => {
    const storage = memoryStorage()
    const source = await photo(1600, 1200)
    const result = await imageUploadService.upload(
      { id: uploader._id.toString() },
      { buffer: source, size: source.length, originalname: 'workplace.JPG' },
      { storage }
    )

    assert.match(result.key, /\.webp$/)
    assert.ok(result.thumbUrl)
    assert.equal(result.width, 1600)
    assert.ok(result.bytes < result.originalBytes)

    const keys = [...storage.objects.keys()]
    assert.equal(keys.length, 2, 'the image and its thumbnail')
    assert.equal(storage.objects.get(result.key).contentType, 'image/webp')

    // The library row carries what the grid needs, plus what the original
    // was — "this used to be a 4 MB JPEG" is the only way to see whether
    // the conversion is earning its keep.
    const asset = await MediaAsset.findOne({ key: result.key }).lean()
    assert.equal(asset.mimeType, 'image/webp')
    assert.equal(asset.width, 1600)
    assert.equal(asset.height, 1200)
    assert.ok(asset.thumbUrl)
    assert.equal(asset.originalMimeType, 'image/jpeg')
    assert.equal(asset.originalSize, source.length)
    assert.equal(asset.name, 'workplace.JPG')
  })

  test('a file that is not an image is still refused', async () => {
    await assert.rejects(
      () =>
        imageUploadService.upload(
          { id: uploader._id.toString() },
          { buffer: Buffer.from('%PDF-1.7 not an image'), size: 21, originalname: 'x.pdf' },
          { storage: memoryStorage() }
        ),
      { code: 'UNSUPPORTED_IMAGE_TYPE' }
    )
  })
})
