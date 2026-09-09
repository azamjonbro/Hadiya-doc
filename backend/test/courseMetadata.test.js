// 3.4 — catalog metadata, the new filters, and migration M3.
//
// The interesting property is the one M3 exists for: Mongoose defaults are
// applied when a document is *created*, never to documents already stored.
// A course written before these fields existed therefore has no `level` at
// all, and `{ level: 'BEGINNER' }` does not match a missing field — so
// without the backfill every pre-existing course drops out of a filtered
// catalog while still appearing in the unfiltered one. That is the failure
// this file pins down, along with the rule that makes the migration safe to
// run twice: it only writes fields that are absent.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { CourseCategory } from '../src/models/courseCategory.model.js'
import { courseRepository } from '../src/repositories/course.repository.js'
import { courseCategoryService } from '../src/services/courses/courseCategory.service.js'
import { M3_DEFAULTS, planWrites } from '../src/scripts/migrateCourseMetadata.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const actor = { id: new mongoose.Types.ObjectId().toString() }

let safety
let electrical
let legacy
const courseIds = []
const categoryIds = []

async function makeCourse(fields) {
  const course = await Course.create({
    title: fields.title,
    slug: `${fields.title.toLowerCase().replace(/\W+/g, '-')}-${stamp}`,
    createdBy: actor.id,
    status: 'PUBLISHED',
    ...fields,
  })
  courseIds.push(course._id)
  return course
}

describe('course metadata (3.4)', () => {
  before(async () => {
    await connectDatabase()

    const category = await courseCategoryService.create(actor, { name: `Safety ${stamp}`, color: '#ff8800' })
    categoryIds.push(new mongoose.Types.ObjectId(category.id))

    safety = await makeCourse({
      title: `Workplace safety ${stamp}`,
      description: 'Fire drills and protective equipment',
      categoryId: category.id,
      tags: [`xavfsizlik-${stamp}`, 'yillik'],
      level: 'BEGINNER',
      estimatedMinutes: 90,
    })

    electrical = await makeCourse({
      title: `Electrical work ${stamp}`,
      description: 'High voltage procedures',
      tags: ['elektr'],
      level: 'ADVANCED',
    })

    // Written straight through the driver so none of the schema defaults
    // apply — this is what a course created before 3.4 actually looks like
    // on disk, and the reason M3 exists.
    const inserted = await Course.collection.insertOne({
      title: `Legacy course ${stamp}`,
      slug: `legacy-course-${stamp}`,
      description: '',
      status: 'PUBLISHED',
      createdBy: new mongoose.Types.ObjectId(actor.id),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    legacy = inserted.insertedId
    courseIds.push(legacy)
  })

  after(async () => {
    await Course.deleteMany({ _id: { $in: courseIds } })
    await CourseCategory.deleteMany({ _id: { $in: categoryIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('filters', () => {
    test('by category', async () => {
      const rows = await courseRepository.listPage({
        categoryId: safety.categoryId,
        limit: 50,
      })
      const titles = rows.map((row) => row.title)
      assert.ok(titles.includes(safety.title))
      assert.ok(!titles.includes(electrical.title))
    })

    test('by level', async () => {
      const rows = await courseRepository.listPage({ level: 'ADVANCED', limit: 50 })
      const ids = rows.map((row) => String(row._id))
      assert.ok(ids.includes(String(electrical._id)))
      assert.ok(!ids.includes(String(safety._id)))
    })

    test('by tag', async () => {
      const rows = await courseRepository.listPage({ tag: `xavfsizlik-${stamp}`, limit: 50 })
      assert.deepEqual(rows.map((row) => String(row._id)), [String(safety._id)])
    })

    test('search still matches a partial word, and now looks at tags too', async () => {
      // The reason the catalog list did not move to $text: a full-text index
      // matches whole words, and this box is typed into one letter at a time.
      const byPrefix = await courseRepository.listPage({ search: 'Electric', limit: 50 })
      assert.ok(byPrefix.some((row) => String(row._id) === String(electrical._id)))

      const byTag = await courseRepository.listPage({ search: 'elektr', limit: 50 })
      assert.ok(byTag.some((row) => String(row._id) === String(electrical._id)))
    })

    test('the tag list is what is actually in use', async () => {
      const tags = await courseRepository.listTags()
      assert.ok(tags.includes(`xavfsizlik-${stamp}`))
      assert.ok(tags.includes('elektr'))
    })
  })

  describe('$text search', () => {
    test('ranks a title match above a description match', async () => {
      const rows = await courseRepository.searchText(`Electrical ${stamp}`, { limit: 10 })
      assert.ok(rows.length, 'the course_text index must exist — start the backend once if this fails')
      assert.equal(String(rows[0]._id), String(electrical._id))
    })
  })

  describe('migration M3', () => {
    test('only writes fields that are missing', () => {
      const writes = planWrites()
      // Every write is fenced on $exists:false. Without that, one $set of
      // all the defaults would reset a course whose completion rule or
      // level had been tuned — data loss dressed up as a migration.
      for (const write of writes) {
        const [field] = Object.keys(write.filter)
        assert.deepEqual(write.filter[field], { $exists: false })
        assert.deepEqual(Object.keys(write.update.$set), [field])
      }
      assert.equal(writes.length, Object.keys(M3_DEFAULTS).length)
    })

    test('a pre-3.4 course is invisible to a filter until it is backfilled', async () => {
      // Before: the legacy row is in the catalog but not in a levelled view.
      const unfiltered = await courseRepository.listPage({ limit: 200 })
      assert.ok(unfiltered.some((row) => String(row._id) === String(legacy)))

      const filtered = await courseRepository.listPage({ level: 'BEGINNER', limit: 200 })
      assert.ok(
        !filtered.some((row) => String(row._id) === String(legacy)),
        'a missing field does not match its own default — this is what M3 fixes'
      )

      // After: applying the plan puts it back where it belongs.
      for (const write of planWrites()) await Course.updateMany({ _id: legacy, ...write.filter }, write.update)

      const afterwards = await courseRepository.listPage({ level: 'BEGINNER', limit: 200 })
      assert.ok(afterwards.some((row) => String(row._id) === String(legacy)))
    })

    test('navigationMode defaults to what the platform already does', () => {
      // SEQUENTIAL is courseSequence.js's existing lock behaviour, so the
      // migration changes what the database says and not what it does.
      assert.equal(M3_DEFAULTS.navigationMode, 'SEQUENTIAL')
      assert.equal(M3_DEFAULTS.allowSelfEnroll, false)
      assert.equal(M3_DEFAULTS.version, 1)
    })
  })

  describe('categories', () => {
    test('carry the number of courses in them', async () => {
      const { items } = await courseCategoryService.list()
      const mine = items.find((item) => item.id === String(safety.categoryId))
      assert.equal(mine.courseCount, 1)
    })

    test('deleting one leaves its courses uncategorised rather than deleted', async () => {
      const category = await courseCategoryService.create(actor, { name: `Temporary ${stamp}` })
      categoryIds.push(new mongoose.Types.ObjectId(category.id))
      await Course.updateOne({ _id: electrical._id }, { $set: { categoryId: category.id } })

      const result = await courseCategoryService.remove(actor, category.id)
      assert.equal(result.coursesUncategorised, 1)

      const survivor = await Course.findById(electrical._id).lean()
      assert.ok(survivor, 'the course must survive its category being deleted')
      assert.equal(survivor.categoryId, null)
    })
  })
})
