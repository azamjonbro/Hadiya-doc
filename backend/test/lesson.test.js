// 9.1 — the polymorphic content base, and the text lesson as its first new
// member.
//
// The base was half built: contentItem.js held the shared visibility gate
// and a reorder, `nextOrder()` had no callers at all, and the fourth kind of
// content it was written for did not exist. So the properties under test are
// mostly about the *shared* contract rather than about lessons in
// particular:
//
//   - one sequence across four collections. Every type used to number from
//     its own last item, so a topic with three videos and three files held
//     two items at position 0, two at 1 and two at 2, and the curriculum
//     came out in whatever order the sort settled on.
//   - a reorder that is given the whole topic, because a partial list
//     re-creates exactly those collisions.
//   - a draft is `notFound`, not `forbidden` — the answer the other three
//     types already gave.
//   - a lesson counts towards completion like a document, by the fraction
//     actually read (AT-01, AT-04).
//
// And two that are specific to lessons: a TEXT block is rich HTML rendered
// back with `v-html`, so what the server accepts, every reader executes; and
// a VIDEO or FILE block names course content by id, which is what decides
// who may watch it — so a lesson may only point inside its own course (9.2).

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
import { Assessment } from '../src/models/assessment.model.js'
import { Lesson } from '../src/models/lesson.model.js'
import { LessonProgress } from '../src/models/lessonProgress.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { Notification } from '../src/models/notification.model.js'
import { MailLog } from '../src/models/mailLog.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { lessonService } from '../src/services/courses/lesson.service.js'
import { lessonProgressService } from '../src/services/courses/lessonProgress.service.js'
import { topicContentService } from '../src/services/courses/topicContent.service.js'
import { courseDuplicateService } from '../src/services/courses/courseDuplicate.service.js'
import { courseCompletionService, collectCourseItems } from '../src/services/courses/courseCompletion.service.js'
import { nextOrder, countContent, reorderContent } from '../src/services/courses/contentItem.js'
import { toStoredBlocks, lessonCompletion } from '../src/services/courses/lessonBlocks.js'
import { createLessonSchema, updateLessonSchema } from '../src/validators/lesson.validator.js'
import { normalizeEmbed } from '../src/services/courses/lessonEmbeds.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { certificateQueue } from '../src/jobs/certificateQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0
let author
let learner
const courseIds = []
const userIds = []

const authorActor = () => ({
  id: author._id.toString(),
  permissions: ['video:view', 'course:create', 'course:update'],
})
const learnerActor = () => ({ id: learner._id.toString(), permissions: ['video:view'] })

async function makeUser(name) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  const user = await User.create({
    firstName: name,
    lastName: 'Lesson',
    fullName: `${name} Lesson`,
    jshshir: `16${stamp}${String(userIds.length).padStart(3, '0')}`,
    passwordHash: await hashPassword('LessonTest123!'),
    roleId: role._id,
  })
  userIds.push(user._id)
  return user
}

async function makeCourse({ assign = false, topicStatus = 'PUBLISHED' } = {}) {
  const course = await Course.create({
    title: `Lesson base ${stamp}-${seq}`,
    description: 'x',
    slug: `lesson-base-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  courseIds.push(course._id)
  const topic = await Topic.create({
    courseId: course._id,
    title: 'T',
    slug: `t-${stamp}-${seq++}`,
    order: 0,
    status: topicStatus,
    createdBy: author._id,
  })
  if (assign) {
    await CourseAssignment.create({ userId: learner._id, courseId: course._id, assignedBy: author._id })
  }
  return { course, topic }
}

const blocks = (count = 2) =>
  Array.from({ length: count }, (_, index) => ({ type: 'TEXT', text: `<p>Band ${index + 1}</p>` }))

const statusOf = (course) =>
  CourseAssignment.findOne({ userId: learner._id, courseId: course._id })
    .lean()
    .then((row) => row.status)

describe('9.1 · content base and text lessons', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')
    author = await makeUser('Muallif')
    learner = await makeUser('Oquvchi')
  })

  after(async () => {
    await LessonProgress.deleteMany({ userId: { $in: userIds } })
    await Notification.deleteMany({ userId: { $in: userIds } })
    await MailLog.deleteMany({ userId: { $in: userIds } })
    await CourseAssignment.deleteMany({ userId: { $in: userIds } })
    await Lesson.deleteMany({ courseId: { $in: courseIds } })
    await Video.deleteMany({ courseId: { $in: courseIds } })
    await Material.deleteMany({ courseId: { $in: courseIds } })
    await Assessment.deleteMany({ courseId: { $in: courseIds } })
    await Topic.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await certificateQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.close()
    await certificateQueue.close()
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('blocks', () => {
    test('a TEXT block keeps its markup and loses its scripts', () => {
      const [block] = toStoredBlocks([
        {
          type: 'TEXT',
          text:
            '<p onclick="steal()">Qoida <strong>bir</strong>' +
            '<script>fetch("/api/v1/users")</script>' +
            '<a href="javascript:alert(1)">bosing</a></p>',
        },
      ])
      assert.match(block.text, /<strong>bir<\/strong>/)
      // The handler, the script *and its contents*, and the scheme all go.
      assert.doesNotMatch(block.text, /onclick/)
      assert.doesNotMatch(block.text, /fetch\(/)
      assert.doesNotMatch(block.text, /javascript:/)
      // An outbound link cannot reach back through window.opener.
      assert.match(block.text, /rel="noopener noreferrer"/)
    })

    test('a heading is a line of text, not a document', () => {
      const [block] = toStoredBlocks([{ type: 'HEADING', text: '<b>Kirish</b><script>x</script>', level: '3' }])
      assert.equal(block.text, 'Kirish')
      assert.equal(block.level, 3)
      // h1 is the lesson title; an out-of-range level falls back to h2
      // rather than being stored as h7.
      assert.equal(toStoredBlocks([{ type: 'HEADING', text: 'x', level: 9 }])[0].level, 2)
    })

    test('an unknown block type is refused, not stored empty', () => {
      const parsed = createLessonSchema.safeParse({ title: 'x', blocks: [{ type: 'CAROUSEL', text: 'hi' }] })
      assert.equal(parsed.success, false)
    })

    test('an image URL has to be one a browser will load', () => {
      // `z.string().url()` accepts javascript: and data: — both are URLs.
      for (const url of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=']) {
        assert.equal(createLessonSchema.safeParse({ title: 'x', blocks: [{ type: 'IMAGE', url }] }).success, false)
      }
      assert.equal(
        createLessonSchema.safeParse({ title: 'x', blocks: [{ type: 'IMAGE', url: 'https://a/b.png' }] }).success,
        true
      )
    })

    test('an empty update is refused — it is a client bug, not a no-op', () => {
      assert.equal(updateLessonSchema.safeParse({}).success, false)
      assert.equal(updateLessonSchema.safeParse({ blocks: [] }).success, true)
    })
  })

  describe('the twelve block types (9.2)', () => {
    test('every type round-trips with its own fields', async () => {
      const { course, topic } = await makeCourse()
      const video = await Video.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'V',
        order: 0,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const material = await Material.create({
        courseId: course._id,
        topicId: topic._id,
        type: 'FILE',
        title: 'M',
        key: `k-${stamp}-${seq++}`,
        mimeType: 'application/pdf',
        status: 'PUBLISHED',
        createdBy: author._id,
      })

      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Hammasi',
        blocks: [
          { type: 'HEADING', text: 'Sarlavha', level: 3 },
          { type: 'TEXT', text: '<p>Matn</p>' },
          { type: 'QUOTE', text: '<p>Gap</p>', author: 'Kimdir' },
          { type: 'CALLOUT', text: '<p>Diqqat</p>', variant: 'WARNING' },
          { type: 'CODE', text: 'if (a < b) return "<b>"', language: 'js' },
          { type: 'IMAGE', url: 'https://example.com/a.png', alt: 'a' },
          { type: 'GALLERY', items: [{ url: 'https://example.com/1.png' }, { url: 'https://example.com/2.png' }] },
          { type: 'EMBED', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s' },
          { type: 'VIDEO', videoId: video._id.toString(), caption: 'Ko\'rish' },
          { type: 'FILE', materialId: material._id.toString() },
          { type: 'TABLE', rows: [['A', 'B'], ['1']], hasHeader: true },
          { type: 'DIVIDER' },
        ],
      })

      const by = Object.fromEntries(lesson.blocks.map((block) => [block.type, block]))
      assert.equal(lesson.blockCount, 12)
      assert.equal(by.HEADING.level, 3)
      assert.equal(by.QUOTE.author, 'Kimdir')
      assert.equal(by.CALLOUT.variant, 'WARNING')
      // Code is stored verbatim. Running it through the HTML sanitiser
      // would eat any snippet that mentions a tag.
      assert.equal(by.CODE.text, 'if (a < b) return "<b>"')
      assert.equal(by.GALLERY.items.length, 2)
      // The pasted watch URL is stored in its embeddable form, with the
      // timestamp kept — fixing it in the reader would mean every reader
      // guessing.
      assert.equal(by.EMBED.url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90')
      assert.equal(by.EMBED.provider, 'YOUTUBE')
      assert.equal(String(by.VIDEO.videoId), video._id.toString())
      assert.equal(String(by.FILE.materialId), material._id.toString())
      // The short row is padded rather than refused: an author adding a
      // column leaves the rows below it short until they type in them.
      assert.deepEqual(by.TABLE.rows, [['A', 'B'], ['1', '']])
    })

    test('an embed off the allowlist is refused', async () => {
      const { topic } = await makeCourse()
      // The validator says no before the service is reached, and says which
      // hosts are allowed.
      const parsed = createLessonSchema.safeParse({
        title: 'x',
        blocks: [{ type: 'EMBED', url: 'https://evil.example.com/frame' }],
      })
      assert.equal(parsed.success, false)
      assert.match(parsed.error.issues[0].message, /Embeds are allowed from/)

      // And the storage path refuses it too, so a script or a migration
      // cannot write a frame that will never render.
      await assert.rejects(
        () =>
          lessonService.create(authorActor(), topic._id.toString(), {
            title: 'x',
            blocks: [{ type: 'EMBED', url: 'https://evil.example.com/frame' }],
          }),
        { code: 'EMBED_NOT_ALLOWED' }
      )
    })

    test('an http embed is refused — it could never render on https', () => {
      assert.equal(normalizeEmbed('http://www.youtube.com/watch?v=dQw4w9WgXcQ'), null)
      assert.equal(normalizeEmbed('https://vimeo.com/76979871').provider, 'VIMEO')
      // Drive's own /view link does not frame; the stored one does.
      assert.equal(
        normalizeEmbed('https://drive.google.com/file/d/1AbC/view').url,
        'https://drive.google.com/file/d/1AbC/preview'
      )
    })

    test('a reference is expanded for the reader, or reported unavailable', async () => {
      const { course, topic } = await makeCourse()
      const draftVideo = await Video.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'Hali chiqarilmagan',
        order: 0,
        status: 'DRAFT',
        createdBy: author._id,
      })
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Havola',
        blocks: [{ type: 'VIDEO', videoId: draftVideo._id.toString() }],
        status: 'PUBLISHED',
      })

      // The author previewing sees the draft video, with its title — the
      // same rule that lets them see a draft lesson at all.
      const asAuthor = await lessonService.getById(authorActor(), lesson.id)
      assert.equal(asAuthor.blocks[0].video.title, 'Hali chiqarilmagan')

      // The learner gets a placeholder rather than a card that leads
      // nowhere, and nothing about the unpublished video.
      const asLearner = await lessonService.getById(learnerActor(), lesson.id)
      assert.equal(asLearner.blocks[0].unavailable, true)
      assert.equal(asLearner.blocks[0].video, undefined)
    })

    test('a lesson cannot reference another course’s video', async () => {
      const mine = await makeCourse()
      const other = await makeCourse()
      const theirVideo = await Video.create({
        courseId: other.course._id,
        topicId: other.topic._id,
        title: 'Begona',
        order: 0,
        status: 'PUBLISHED',
        createdBy: author._id,
      })

      // The reference is what decides who may watch it: without this check
      // an author could put a video targeted at another branch into their
      // own lesson and every rule that course set would be bypassed.
      await assert.rejects(
        () =>
          lessonService.create(authorActor(), mine.topic._id.toString(), {
            title: 'x',
            blocks: [{ type: 'VIDEO', videoId: theirVideo._id.toString() }],
          }),
        { code: 'REFERENCE_NOT_IN_COURSE' }
      )

      // …and the same on the way in through an edit, not only on create.
      const lesson = await lessonService.create(authorActor(), mine.topic._id.toString(), {
        title: 'x',
        blocks: blocks(1),
      })
      await assert.rejects(
        () =>
          lessonService.update(authorActor(), lesson.id, {
            blocks: [{ type: 'FILE', materialId: new mongoose.Types.ObjectId().toString() }],
          }),
        { code: 'REFERENCE_NOT_IN_COURSE' }
      )
    })
  })

  describe('one sequence across four collections', () => {
    test('a new item lands at the end of the topic, not of its own type', async () => {
      const { course, topic } = await makeCourse()
      await Video.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'V',
        order: await nextOrder(topic._id),
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(1),
      })
      // 1, not 0: the video is already at 0, and this is the whole point —
      // before 9.1 both would have been at 0.
      assert.equal(lesson.order, 1)
      assert.equal(await nextOrder(topic._id), 2)
      assert.equal(await countContent(topic._id), 2)
    })

    test('a reorder renumbers every collection densely', async () => {
      const { course, topic } = await makeCourse()
      const video = await Video.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'V',
        order: 7,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const assessment = await Assessment.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'A',
        order: 7,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(1),
        status: 'PUBLISHED',
      })

      const result = await reorderContent(topic._id, [
        { id: lesson.id, contentType: 'LESSON' },
        { id: assessment._id.toString(), contentType: 'ASSESSMENT' },
        { id: video._id.toString(), contentType: 'VIDEO' },
      ])
      assert.equal(result.reordered, 3)

      const items = await topicContentService.getContent(authorActor(), topic._id.toString())
      assert.deepEqual(
        items.map((item) => [item.contentType, item.order]),
        [
          ['LESSON', 0],
          ['ASSESSMENT', 1],
          ['VIDEO', 2],
        ]
      )
    })

    test('a partial list is refused rather than half applied', async () => {
      const { course, topic } = await makeCourse()
      await Video.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'V',
        order: 0,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(1),
      })
      // Sending one of two items would number that one 0 and leave the
      // other at 0 as well — the collision the reorder exists to repair.
      await assert.rejects(() => reorderContent(topic._id, [{ id: lesson.id, contentType: 'LESSON' }]), {
        code: 'INCOMPLETE_ORDER',
      })
      const after = await Lesson.findById(lesson.id).lean()
      assert.equal(after.order, 1)
    })

    test("an id from another topic cannot be moved by naming it", async () => {
      const mine = await makeCourse()
      const other = await makeCourse()
      const outsider = await lessonService.create(authorActor(), other.topic._id.toString(), {
        title: 'Boshqa',
        blocks: blocks(1),
      })
      const own = await lessonService.create(authorActor(), mine.topic._id.toString(), {
        title: 'Ozim',
        blocks: blocks(1),
      })
      // A second item so the list is the right *length* — the count guard
      // is about how many, and the write filter is what refuses an id that
      // belongs to another topic.
      await Video.create({
        courseId: mine.course._id,
        topicId: mine.topic._id,
        title: 'V',
        order: await nextOrder(mine.topic._id),
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const result = await reorderContent(mine.topic._id, [
        { id: outsider.id, contentType: 'LESSON' },
        { id: own.id, contentType: 'LESSON' },
      ])
      assert.equal(result.reordered, 1)
      assert.equal((await Lesson.findById(outsider.id).lean()).order, 0)
    })
  })

  describe('visibility', () => {
    test('a draft lesson does not exist as far as a learner is concerned', async () => {
      const { topic } = await makeCourse()
      const draft = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Qoralama',
        blocks: blocks(1),
      })
      assert.equal(draft.status, 'DRAFT')
      // notFound, not forbidden: somebody who may not read a draft should
      // not learn that one is being written.
      await assert.rejects(() => lessonService.getById(learnerActor(), draft.id), { statusCode: 404 })
      assert.equal((await lessonService.getById(authorActor(), draft.id)).id, draft.id)

      assert.equal((await lessonService.listByTopic(learnerActor(), topic._id.toString())).length, 0)
      assert.equal((await lessonService.listByTopic(authorActor(), topic._id.toString())).length, 1)
    })

    test('a listing carries the block count but not the blocks', async () => {
      const { topic } = await makeCourse()
      await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(4),
        status: 'PUBLISHED',
      })
      const [row] = await lessonService.listByTopic(learnerActor(), topic._id.toString())
      assert.equal(row.blockCount, 4)
      assert.equal(row.blocks, undefined)
    })

    test('an empty lesson cannot be published', async () => {
      const { topic } = await makeCourse()
      await assert.rejects(
        () => lessonService.create(authorActor(), topic._id.toString(), { title: 'Bosh', status: 'PUBLISHED' }),
        { code: 'LESSON_EMPTY' }
      )
      const draft = await lessonService.create(authorActor(), topic._id.toString(), { title: 'Bosh' })
      await assert.rejects(() => lessonService.update(authorActor(), draft.id, { status: 'PUBLISHED' }), {
        code: 'LESSON_EMPTY',
      })
      // …and emptying a published one is the same refusal, not a silent
      // un-completable item in somebody's curriculum.
      const live = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Tirik',
        blocks: blocks(1),
        status: 'PUBLISHED',
      })
      await assert.rejects(() => lessonService.update(authorActor(), live.id, { blocks: [] }), {
        code: 'LESSON_EMPTY',
      })
    })
  })

  describe('reading progress', () => {
    test('blocks seen, not the furthest point reached', async () => {
      const { topic } = await makeCourse()
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(4),
        status: 'PUBLISHED',
      })
      const ids = lesson.blocks.map((block) => block.id)

      let progress = await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [ids[3]])
      assert.equal(progress.completionPercent, 25)
      assert.equal(progress.completed, false)

      // Idempotent: the same block twice is still one block.
      progress = await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [ids[3], ids[3], ids[0]])
      assert.equal(progress.viewedBlocks, 2)
      assert.equal(progress.completionPercent, 50)

      progress = await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [ids[1], ids[2]])
      assert.equal(progress.completionPercent, 100)
      assert.equal(progress.completed, true)
    })

    test('ids from another lesson are refused', async () => {
      const { topic } = await makeCourse()
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(2),
        status: 'PUBLISHED',
      })
      await assert.rejects(
        () => lessonProgressService.recordBlocks(learnerActor(), lesson.id, [new mongoose.Types.ObjectId().toString()]),
        { code: 'UNKNOWN_BLOCK' }
      )
    })

    test('finishing early needs the end of the lesson', async () => {
      const { topic } = await makeCourse()
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(3),
        status: 'PUBLISHED',
      })
      const ids = lesson.blocks.map((block) => block.id)

      await assert.rejects(() => lessonProgressService.markComplete(learnerActor(), lesson.id), {
        code: 'LESSON_NOT_STARTED',
      })
      await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [ids[0]])
      await assert.rejects(() => lessonProgressService.markComplete(learnerActor(), lesson.id), {
        code: 'LESSON_NOT_AT_END',
      })
      // A block skipped in a fast scroll would otherwise leave the reader
      // at 2 of 3 forever, with nothing they can do about it.
      await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [ids[2]])
      const done = await lessonProgressService.markComplete(learnerActor(), lesson.id)
      assert.equal(done.completed, true)
      assert.equal(done.completionPercent, 100)
    })

    test('an edit that keeps a block keeps the reader’s place', async () => {
      const { topic } = await makeCourse()
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(2),
        status: 'PUBLISHED',
      })
      const ids = lesson.blocks.map((block) => block.id)
      await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [ids[0]])

      // The editor sends the whole array back, with ids for the blocks that
      // already existed. Progress is recorded against those ids, so an
      // author fixing a typo must not reset anybody.
      const edited = await lessonService.update(authorActor(), lesson.id, {
        blocks: [
          { id: ids[0], type: 'TEXT', text: '<p>Band 1 (tuzatildi)</p>' },
          { id: ids[1], type: 'TEXT', text: '<p>Band 2</p>' },
        ],
      })
      assert.deepEqual(
        edited.blocks.map((block) => block.id),
        ids
      )
      assert.equal((await lessonProgressService.get(learnerActor(), lesson.id)).completionPercent, 50)

      // A block the author deletes stops counting rather than crediting a
      // reader for content that is no longer in the lesson.
      await lessonService.update(authorActor(), lesson.id, {
        blocks: [{ id: ids[1], type: 'TEXT', text: '<p>Band 2</p>' }],
      })
      const after = await lessonProgressService.get(learnerActor(), lesson.id)
      assert.equal(after.totalBlocks, 1)
      assert.equal(after.completionPercent, 0)
    })

    test('finished stays finished when the lesson grows', async () => {
      const { topic } = await makeCourse()
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(1),
        status: 'PUBLISHED',
      })
      await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [lesson.blocks[0].id])

      const grown = await lessonService.update(authorActor(), lesson.id, {
        blocks: [
          { id: lesson.blocks[0].id, type: 'TEXT', text: '<p>Band 1</p>' },
          { type: 'TEXT', text: '<p>Yangi band</p>' },
        ],
      })
      assert.equal(grown.blockCount, 2)
      const progress = await lessonProgressService.get(learnerActor(), lesson.id)
      assert.equal(progress.completed, true)
      assert.equal(progress.completionPercent, 100)
    })

    test('progress is computed, so a stored row cannot go stale', () => {
      const lesson = { blocks: [{ _id: 'a' }, { _id: 'b' }] }
      // A row naming a block that no longer exists is not credited.
      assert.equal(lessonCompletion(lesson, { viewedBlocks: ['a', 'zz'] }).completionPercent, 50)
      // A lesson with nothing in it is 0%, never 100 — which is also why it
      // cannot be published.
      assert.equal(lessonCompletion({ blocks: [] }, { viewedBlocks: [] }).completionPercent, 0)
      assert.equal(lessonCompletion({ blocks: [] }, { viewedBlocks: [] }).completed, false)
    })
  })

  describe('completion (AT-01, AT-04)', () => {
    test('a course made only of a lesson can be finished', async () => {
      const { course, topic } = await makeCourse({ assign: true })
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Dars',
        blocks: blocks(2),
        status: 'PUBLISHED',
      })

      const items = await collectCourseItems(course._id, learner._id)
      assert.deepEqual(
        items.map((item) => item.kind),
        ['lesson']
      )
      assert.equal(await statusOf(course), 'ACTIVE')

      // Half read is half of the item, exactly like a document.
      await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [lesson.blocks[0].id])
      let evaluated = await courseCompletionService.evaluate(learner._id, course._id)
      assert.equal(evaluated.completionPercent, 50)
      assert.equal(evaluated.complete, false)

      await lessonProgressService.recordBlocks(learnerActor(), lesson.id, [lesson.blocks[1].id])
      evaluated = await courseCompletionService.evaluate(learner._id, course._id)
      assert.equal(evaluated.completionPercent, 100)
      assert.equal(evaluated.complete, true)
      // The progress call itself already moved the assignment — the reader
      // does not have to open the course page for it to count.
      assert.equal(await statusOf(course), 'COMPLETED')
    })

    test('publishing another required lesson reopens the course', async () => {
      const { course, topic } = await makeCourse({ assign: true })
      const first = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Birinchi',
        blocks: blocks(1),
        status: 'PUBLISHED',
      })
      await lessonProgressService.recordBlocks(learnerActor(), first.id, [first.blocks[0].id])
      assert.equal(await statusOf(course), 'COMPLETED')

      // AT-04, and the reason lesson.service walks the learners on the
      // transition into PUBLISHED: nobody in that group is making a request
      // at the moment the author publishes.
      const second = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Ikkinchi',
        blocks: blocks(1),
      })
      assert.equal(await statusOf(course), 'COMPLETED')
      await lessonService.update(authorActor(), second.id, { status: 'PUBLISHED' })
      assert.equal(await statusOf(course), 'ACTIVE')

      // …and withdrawing it puts the course back, because the published set
      // is what completion is judged on.
      await lessonService.update(authorActor(), second.id, { status: 'DRAFT' })
      assert.equal(await statusOf(course), 'COMPLETED')
    })

    test('a draft lesson does not hold anybody back', async () => {
      const { course, topic } = await makeCourse({ assign: true })
      const published = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Chiqarilgan',
        blocks: blocks(1),
        status: 'PUBLISHED',
      })
      await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Qoralama',
        blocks: blocks(3),
      })
      await lessonProgressService.recordBlocks(learnerActor(), published.id, [published.blocks[0].id])
      assert.equal(await statusOf(course), 'COMPLETED')
    })

    test('deleting the last unread lesson completes the course', async () => {
      const { course, topic } = await makeCourse({ assign: true })
      const read = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Oqilgan',
        blocks: blocks(1),
        status: 'PUBLISHED',
      })
      const unread = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Oqilmagan',
        blocks: blocks(1),
        status: 'PUBLISHED',
      })
      await lessonProgressService.recordBlocks(learnerActor(), read.id, [read.blocks[0].id])
      assert.equal(await statusOf(course), 'ACTIVE')

      await lessonService.remove(authorActor(), unread.id)
      assert.equal(await statusOf(course), 'COMPLETED')
    })
  })

  describe('duplication', () => {
    test('a VIDEO block is re-pointed at the copied video', async () => {
      const { course, topic } = await makeCourse()
      const video = await Video.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'V',
        order: 0,
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      const material = await Material.create({
        courseId: course._id,
        topicId: topic._id,
        type: 'FILE',
        title: 'M',
        key: `k-${stamp}-${seq++}`,
        mimeType: 'application/pdf',
        status: 'PUBLISHED',
        createdBy: author._id,
      })
      await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Havolalar',
        blocks: [
          { type: 'VIDEO', videoId: video._id.toString() },
          { type: 'FILE', materialId: material._id.toString() },
        ],
        status: 'PUBLISHED',
      })

      const result = await courseDuplicateService.duplicate(authorActor(), course._id.toString())
      courseIds.push(new mongoose.Types.ObjectId(result.course.id))

      const [copied] = await Lesson.find({ courseId: result.course.id }).lean()
      const copiedVideo = await Video.findOne({ courseId: result.course.id }).lean()
      const copiedMaterial = await Material.findOne({ courseId: result.course.id }).lean()
      // Still naming the original's rows would be both the wrong video and
      // a way around the original course's access rules.
      assert.equal(String(copied.blocks[0].videoId), String(copiedVideo._id))
      assert.equal(String(copied.blocks[1].materialId), String(copiedMaterial._id))
      assert.notEqual(String(copied.blocks[0].videoId), String(video._id))
    })

    test('a copied course carries its lessons, with new block ids', async () => {
      const { course, topic } = await makeCourse()
      const lesson = await lessonService.create(authorActor(), topic._id.toString(), {
        title: 'Nusxalanadigan',
        blocks: blocks(3),
        status: 'PUBLISHED',
        estimatedMinutes: 5,
      })

      const result = await courseDuplicateService.duplicate(authorActor(), course._id.toString())
      courseIds.push(new mongoose.Types.ObjectId(result.course.id))
      assert.equal(result.counts.lessons, 1)

      const copied = await Lesson.find({ courseId: result.course.id }).lean()
      assert.equal(copied.length, 1)
      assert.equal(copied[0].title, 'Nusxalanadigan')
      assert.equal(copied[0].blocks.length, 3)
      assert.equal(copied[0].estimatedMinutes, 5)
      // Block ids are what reading progress points at. Shared ids would let
      // a reader's place in the original count towards the copy.
      const originalIds = lesson.blocks.map((block) => block.id)
      copied[0].blocks.forEach((block) => assert.equal(originalIds.includes(String(block._id)), false))
    })
  })
})
