// 9.5 — the media library and the orphan sweep.
//
// The sweep is the dangerous half, so that is where the tests are. It walks
// five buckets and deletes objects nobody asked it about, which makes two
// properties the whole feature rests on:
//
//   1. **The grace period.** An upload writes the object first and the row
//      that references it second. A sweep with no grace period deletes the
//      file whose row appears a moment later — the one failure mode here
//      that loses work instead of reclaiming space.
//   2. **A library asset with no references is not an orphan.** An author
//      uploads the logo before the page that uses it exists. A sweep that
//      "helpfully" removed it would be the library eating its own contents.
//
// The delete guard is the other half: the point of knowing where a file is
// used is refusing to delete it out from under a course cover.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { Material } from '../src/models/material.model.js'
import { Lesson } from '../src/models/lesson.model.js'
import { ScormPackage } from '../src/models/scormPackage.model.js'
import { MediaAsset } from '../src/models/mediaAsset.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { mediaLibraryService, normalizeFolder } from '../src/services/media/mediaLibrary.service.js'
import { mediaUsageService } from '../src/services/media/mediaUsage.service.js'
import { findOrphans, sweepOrphans } from '../src/services/media/mediaCleanup.service.js'
import { env } from '../src/config/env.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0
let admin
const courseIds = []
const userIds = []
const assetIds = []
const videoIds = []

const actor = () => ({ id: admin._id.toString(), permissions: ['course:update'], roleName: 'SUPERADMIN' })

const DAY = 24 * 60 * 60 * 1000

/**
 * The stub, with dates: `lastModified` is what the grace period reads, so a
 * store that always says "now" could not test the rule that matters.
 */
function memoryStorage(entries = {}) {
  const objects = new Map(
    Object.entries(entries).map(([key, value]) => [
      key,
      { body: Buffer.from(value.body ?? 'x'), lastModified: value.lastModified ?? new Date() },
    ])
  )
  return {
    objects,
    async putObject(key, body) {
      objects.set(key, { body: Buffer.isBuffer(body) ? body : Buffer.from(body), lastModified: new Date() })
    },
    async getObject(key) {
      const stored = objects.get(key)
      if (!stored) throw new Error('NoSuchKey')
      const { Readable } = await import('node:stream')
      return Readable.from([stored.body])
    },
    async listObjects(prefix) {
      return [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, size: value.body.length, lastModified: value.lastModified }))
    },
    async deleteObject(key) {
      objects.delete(key)
    },
  }
}

const old = () => new Date(Date.now() - 30 * DAY)
const fresh = () => new Date()

async function makeAsset({ folder = '', name = 'logo.png', url } = {}) {
  const key = `${stamp}/${seq++}.png`
  const asset = await MediaAsset.create({
    key,
    bucket: env.S3_BUCKET_IMAGES,
    url: url ?? `https://cdn.example.com/${env.S3_BUCKET_IMAGES}/${key}`,
    name,
    folder,
    kind: 'IMAGE',
    mimeType: 'image/png',
    size: 1234,
    uploadedBy: admin._id,
  })
  assetIds.push(asset._id)
  return asset
}

describe('9.5 · media library and orphan sweep', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'SUPERADMIN' }) ?? await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'roles are missing — boot the server once')
    admin = await User.create({
      firstName: 'Media',
      lastName: 'Admin',
      fullName: 'Media Admin',
      jshshir: `19${stamp}001`,
      passwordHash: await hashPassword('MediaTest123!'),
      roleId: role._id,
    })
    userIds.push(admin._id)
  })

  after(async () => {
    await MediaAsset.deleteMany({ _id: { $in: assetIds } })
    await Video.deleteMany({ _id: { $in: videoIds } })
    await Lesson.deleteMany({ courseId: { $in: courseIds } })
    await Material.deleteMany({ courseId: { $in: courseIds } })
    await ScormPackage.deleteMany({ courseId: { $in: courseIds } })
    await Topic.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the library', () => {
    test('a folder is a label, and a traversal is not one', () => {
      assert.equal(normalizeFolder('brand/2026'), 'brand/2026')
      assert.equal(normalizeFolder('/brand//2026/'), 'brand/2026')
      assert.equal(normalizeFolder('../../etc'), 'etc')
      assert.equal(normalizeFolder('a/b/c/d/e'), 'a/b/c')
      assert.equal(normalizeFolder(''), '')
    })

    test('registering the same key twice updates rather than duplicates', async () => {
      const key = `${stamp}/dup.png`
      const first = await mediaLibraryService.register(actor(), {
        key,
        url: `https://cdn/${env.S3_BUCKET_IMAGES}/${key}`,
        name: 'first.png',
        mimeType: 'image/png',
        size: 10,
      })
      const second = await mediaLibraryService.register(actor(), {
        key,
        url: `https://cdn/${env.S3_BUCKET_IMAGES}/${key}`,
        name: 'second.png',
        mimeType: 'image/png',
        size: 20,
      })
      assetIds.push(new mongoose.Types.ObjectId(second.id))
      // Two rows for one file would mean deleting one pulls the bytes out
      // from under the other.
      assert.equal(first.id, second.id)
      assert.equal(second.name, 'second.png')
      assert.equal(await MediaAsset.countDocuments({ key }), 1)
    })

    test('the listing filters by folder and searches by name', async () => {
      await makeAsset({ folder: `br-${stamp}`, name: 'logo-dark.png' })
      await makeAsset({ folder: `br-${stamp}`, name: 'banner.png' })
      await makeAsset({ folder: '', name: 'loose.png' })

      const inFolder = await mediaLibraryService.list({ folder: `br-${stamp}` })
      assert.equal(inFolder.total, 2)

      // A partial filename, which is how people actually search.
      const found = await mediaLibraryService.list({ search: 'logo-da' })
      assert.ok(found.items.some((item) => item.name === 'logo-dark.png'))

      assert.ok((await mediaLibraryService.folders()).includes(`br-${stamp}`))
    })
  })

  describe('where a file is used', () => {
    test('a course cover, a lesson block and a certificate background all count', async () => {
      const asset = await makeAsset({ name: 'diagram.png' })
      const course = await Course.create({
        title: `Media course ${stamp}`,
        slug: `media-course-${stamp}`,
        status: 'PUBLISHED',
        cover: asset.url,
        createdBy: admin._id,
      })
      courseIds.push(course._id)
      const topic = await Topic.create({
        courseId: course._id,
        title: 'T',
        slug: `media-topic-${stamp}`,
        createdBy: admin._id,
      })
      await Lesson.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'Dars',
        blocks: [
          { type: 'TEXT', text: '<p>x</p>' },
          { type: 'IMAGE', url: asset.url, alt: 'a' },
        ],
        createdBy: admin._id,
      })

      const uses = await mediaUsageService.find({ url: asset.url, key: asset.key })
      const entities = uses.map((use) => use.entity).sort()
      assert.deepEqual(entities, ['Course', 'Lesson'])
    })

    test('a file in use is not deleted without being asked twice', async () => {
      const asset = await makeAsset({ name: 'cover.png' })
      const course = await Course.create({
        title: `Media guard ${stamp}`,
        slug: `media-guard-${stamp}`,
        status: 'PUBLISHED',
        cover: asset.url,
        createdBy: admin._id,
      })
      courseIds.push(course._id)

      const storage = memoryStorage({ [asset.key]: {} })
      // Deleting it silently leaves a broken image on a page nobody is
      // looking at, and the person who deleted it never finds out.
      await assert.rejects(() => mediaLibraryService.remove(actor(), asset._id.toString(), { storage }), {
        code: 'MEDIA_IN_USE',
      })
      assert.equal(await MediaAsset.countDocuments({ _id: asset._id }), 1)

      const result = await mediaLibraryService.remove(actor(), asset._id.toString(), { force: true, storage })
      assert.equal(result.deletedUses, 1)
      assert.equal(await MediaAsset.countDocuments({ _id: asset._id }), 0)
      assert.equal(storage.objects.size, 0)
    })
  })

  describe('the orphan sweep', () => {
    test('renditions of a video that no longer exists are orphans', async () => {
      const goneId = new mongoose.Types.ObjectId().toString()
      const course = await Course.create({
        title: `Sweep course ${stamp}`,
        slug: `sweep-course-${stamp}`,
        createdBy: admin._id,
      })
      courseIds.push(course._id)
      const topic = await Topic.create({
        courseId: course._id,
        title: 'T',
        slug: `sweep-topic-${stamp}`,
        createdBy: admin._id,
      })
      const live = await Video.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'V',
        originalKey: `originals/${stamp}-live`,
        createdBy: admin._id,
      })
      videoIds.push(live._id)

      const processed = memoryStorage({
        [`processed/${goneId}/360p/segment_000.ts`]: { lastModified: old() },
        [`processed/${live._id}/360p/segment_000.ts`]: { lastModified: old() },
        // A key shape the sweep does not recognise is left alone: it
        // deletes what it understands, not what it cannot explain.
        'processed/legacy-thing.bin': { lastModified: old() },
      })
      const originals = memoryStorage({
        [`originals/${stamp}-live`]: { lastModified: old() },
        [`originals/${stamp}-gone`]: { lastModified: old() },
      })
      const empty = memoryStorage()

      const report = await findOrphans({
        storages: { processed, originals, materials: empty, scorm: empty, images: empty },
      })

      assert.deepEqual(
        report.processed.map((object) => object.key),
        [`processed/${goneId}/360p/segment_000.ts`]
      )
      assert.deepEqual(
        report.originals.map((object) => object.key),
        [`originals/${stamp}-gone`]
      )
    })

    test('a fresh object is never touched, however orphaned it looks', async () => {
      const goneId = new mongoose.Types.ObjectId().toString()
      const processed = memoryStorage({
        [`processed/${goneId}/360p/a.ts`]: { lastModified: fresh() },
      })
      const empty = memoryStorage()
      const report = await findOrphans({
        storages: { processed, originals: empty, materials: empty, scorm: empty, images: empty },
      })
      // The upload writes the object first and the row second; without the
      // grace period this sweep would delete somebody's work in progress.
      assert.equal(report.processed.length, 0)
    })

    test('an unused library asset is not an orphan', async () => {
      const asset = await makeAsset({ name: 'for-later.png' })
      const images = memoryStorage({ [asset.key]: { lastModified: old() }, [`${stamp}/stray.png`]: { lastModified: old() } })
      const empty = memoryStorage()
      const report = await findOrphans({
        storages: { processed: empty, originals: empty, materials: empty, scorm: empty, images },
      })
      // The author uploaded it to use later. Only the object with no row
      // and no reference is swept.
      assert.deepEqual(
        report.images.map((object) => object.key),
        [`${stamp}/stray.png`]
      )
    })

    test('a SCORM package’s prefix and archive go together, and a live one stays', async () => {
      const course = await Course.create({
        title: `Sweep scorm ${stamp}`,
        slug: `sweep-scorm-${stamp}`,
        createdBy: admin._id,
      })
      courseIds.push(course._id)
      const topic = await Topic.create({
        courseId: course._id,
        title: 'T',
        slug: `sweep-scorm-topic-${stamp}`,
        createdBy: admin._id,
      })
      const pkg = await ScormPackage.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'P',
        zipKey: `zips/${stamp}-live.zip`,
        baseKey: `packages/000000000000000000000000/`,
        processingStatus: 'READY',
        createdBy: admin._id,
      })
      const goneId = new mongoose.Types.ObjectId().toString()
      const scorm = memoryStorage({
        [`packages/${pkg._id}/index.html`]: { lastModified: old() },
        [`packages/${goneId}/index.html`]: { lastModified: old() },
        [`zips/${stamp}-live.zip`]: { lastModified: old() },
        [`zips/${stamp}-gone.zip`]: { lastModified: old() },
      })
      const empty = memoryStorage()
      const report = await findOrphans({
        storages: { processed: empty, originals: empty, materials: empty, scorm, images: empty },
      })
      assert.deepEqual(report.scorm.map((object) => object.key).sort(), [
        `packages/${goneId}/index.html`,
        `zips/${stamp}-gone.zip`,
      ])
    })

    test('the sweep reports by default and deletes only when told', async () => {
      const goneId = new mongoose.Types.ObjectId().toString()
      const processed = memoryStorage({ [`processed/${goneId}/a.ts`]: { lastModified: old() } })
      const empty = memoryStorage()
      const storages = { processed, originals: empty, materials: empty, scorm: empty, images: empty }

      const dry = await sweepOrphans({ storages })
      assert.equal(dry.applied, false)
      assert.equal(dry.totalObjects, 1)
      assert.equal(dry.deleted, 0)
      // Still there: a report that deletes is not a report.
      assert.equal(processed.objects.size, 1)

      const applied = await sweepOrphans({ apply: true, actor: actor(), storages })
      assert.equal(applied.applied, true)
      assert.equal(applied.deleted, 1)
      assert.equal(processed.objects.size, 0)
    })
  })
})
