// AT-33 — a material that can be read but not kept.
//
//   GIVEN material.allowDownload = false
//   WHEN  GET /materials/:id/download-url?disposition=attachment
//   THEN  403 DOWNLOAD_NOT_ALLOWED, while GET /materials/:id/content still
//         works — readable, not savable
//
// The flag is deliberately not DRM, and the tests say so: it removes the
// download button and refuses the attachment URL. It cannot stop somebody
// who can read a file from keeping it, and pretending otherwise would be
// the more dangerous claim.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Material } from '../src/models/material.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { materialAccessService } from '../src/services/materials/materialAccess.service.js'
import { materialService } from '../src/services/materials/material.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let learner
let author
let course
let topic
let restricted
let openMaterial
let legacy
const userIds = []

const learnerActor = () => ({ id: learner._id.toString(), permissions: ['video:view'] })
const authorActor = () => ({ id: author._id.toString(), permissions: ['video:view', 'course:create'] })

async function makeUser(name) {
  const user = await User.create({
    firstName: name,
    lastName: 'Mat',
    fullName: `${name} Mat`,
    jshshir: `59${userIds.length}${stamp}`,
    passwordHash: await hashPassword('MatTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
  })
  userIds.push(user._id)
  return user
}

describe('AT-33 · download control', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    learner = await makeUser('Oquvchi')
    author = await makeUser('Muallif')

    course = await Course.create({
      title: `Material course ${stamp}`,
      slug: `material-course-${stamp}`,
      status: 'PUBLISHED',
      createdBy: author._id,
    })
    topic = await Topic.create({
      courseId: course._id,
      title: 'Module',
      slug: 'module',
      status: 'PUBLISHED',
      createdBy: author._id,
    })
    await CourseAssignment.create({
      userId: learner._id,
      courseId: course._id,
      assignedBy: author._id,
      status: 'ACTIVE',
    })

    const base = {
      topicId: topic._id,
      courseId: course._id,
      type: 'FILE',
      mimeType: 'application/pdf',
      status: 'PUBLISHED',
      createdBy: author._id,
    }
    restricted = await Material.create({
      ...base,
      title: `Confidential ${stamp}`,
      key: `materials/restricted-${stamp}.pdf`,
      allowDownload: false,
    })
    openMaterial = await Material.create({
      ...base,
      title: `Open ${stamp}`,
      key: `materials/open-${stamp}.pdf`,
      allowDownload: true,
    })

    // Written through the driver so the field is genuinely absent — this is
    // what every material uploaded before 7.5 looks like on disk.
    const inserted = await Material.collection.insertOne({
      topicId: topic._id,
      courseId: course._id,
      type: 'FILE',
      title: `Legacy ${stamp}`,
      key: `materials/legacy-${stamp}.pdf`,
      mimeType: 'application/pdf',
      status: 'PUBLISHED',
      order: 0,
      createdBy: author._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    legacy = inserted.insertedId
  })

  after(async () => {
    await Promise.all([
      Material.deleteMany({ courseId: course._id }),
      CourseAssignment.deleteMany({ courseId: course._id }),
      Topic.deleteMany({ courseId: course._id }),
    ])
    await Course.deleteOne({ _id: course._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the acceptance case', () => {
    test('the download URL is refused', async () => {
      await assert.rejects(
        () => materialAccessService.getDownloadUrl(learnerActor(), restricted._id, 'attachment'),
        (error) => {
          assert.equal(error.statusCode, 403)
          assert.equal(error.code, 'DOWNLOAD_NOT_ALLOWED')
          return true
        }
      )
    })

    test('an unrestricted material still hands over a URL', async () => {
      // Signing is local — the AWS SDK builds the URL without contacting
      // storage — so this asserts the real result rather than working
      // around MinIO being absent on the dev machines.
      const result = await materialAccessService.getDownloadUrl(learnerActor(), openMaterial._id, 'attachment')
      assert.match(result.url, /^https?:\/\//)
      assert.equal(result.disposition, 'attachment')
    })
  })

  describe('what stays possible', () => {
    test('inline is still issued, because the viewer needs it', async () => {
      // Only audio uses it, and a restricted recording still has to play.
      const result = await materialAccessService.getDownloadUrl(learnerActor(), restricted._id, 'inline')
      assert.equal(result.disposition, 'inline')
    })

    test('staff can still fetch their own upload', async () => {
      // Whoever uploaded the file has to be able to get it back — they are
      // the person who set the flag.
      const result = await materialAccessService.getDownloadUrl(authorActor(), restricted._id, 'attachment')
      assert.equal(result.disposition, 'attachment')
    })
  })

  describe('the field itself', () => {
    test('a material stored before 7.5 stays downloadable', async () => {
      // Flipping the default would silently lock every existing document.
      const items = await materialService.listByTopic(learnerActor(), topic._id.toString())
      const row = items.find((item) => item.id === String(legacy))
      assert.equal(row.allowDownload, true)
    })

    test('the flag reaches the client, so the button can be hidden', async () => {
      const items = await materialService.listByTopic(learnerActor(), topic._id.toString())
      const row = items.find((item) => item.id === String(restricted._id))
      assert.equal(row.allowDownload, false)
    })

    test('it can be turned off later', async () => {
      const updated = await materialService.update(authorActor(), openMaterial._id.toString(), {
        allowDownload: false,
      })
      assert.equal(updated.allowDownload, false)
      await assert.rejects(
        () => materialAccessService.getDownloadUrl(learnerActor(), openMaterial._id, 'attachment'),
        (error) => error.code === 'DOWNLOAD_NOT_ALLOWED'
      )
    })
  })
})
