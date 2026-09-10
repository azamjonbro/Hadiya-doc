import { Course } from '../../models/course.model.js'
import { Topic } from '../../models/topic.model.js'
import { Video } from '../../models/video.model.js'
import { Material } from '../../models/material.model.js'
import { Assessment } from '../../models/assessment.model.js'
import { Lesson } from '../../models/lesson.model.js'
import { Quiz } from '../../models/quiz.model.js'
import { AttentionPolicy } from '../../models/attentionPolicy.model.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { toPublicCourse } from './course.service.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { slugify } from '../../utils/slugify.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

/**
 * Copies a course and everything it is made of.
 *
 * What is copied is the *content*: topics, videos, documents, tests and
 * their questions, plus the course's own attention-policy override. What is
 * deliberately not copied is everything that belongs to people — who was
 * assigned, how far they got, what they scored, what they asked in Q&A,
 * their points and their reviews. A duplicated course is a new course that
 * nobody has taken; carrying somebody's completed status onto a copy they
 * have never opened would be a lie the reports would then repeat.
 *
 * Media is *referenced*, not re-uploaded. A video is gigabytes and its HLS
 * rendition is thousands of segments; copying those to make an editable
 * copy of a syllabus would turn a click into an hour of transfer and double
 * the storage bill. The copy points at the same objects — which works
 * because streaming resolves segments from the manifest key rather than
 * from the video id (videoStream.service.js).
 *
 * That sharing is what makes the reference check in video.service.remove
 * and material.service.remove necessary: deleting one copy's video must not
 * delete the file the other copy is still playing.
 */

async function uniqueSlugFor(title) {
  const base = slugify(title)
  let slug = base
  let counter = 2
  while (await courseRepository.findBySlug(slug)) {
    slug = `${base}-${counter}`
    counter += 1
  }
  return slug
}

/** Strips the fields a copy must not inherit from its source document. */
function copyOf(document, overrides) {
  const { _id, __v, createdAt, updatedAt, ...rest } = document
  return { ...rest, ...overrides }
}

/**
 * Embedded questions, with fresh ids for them and their options.
 *
 * Mongoose keeps a subdocument `_id` that is handed to it, so without this
 * the copy's questions carry the original's ids. An attempt records the
 * question id it answered next to the assessment id, and duplicate question
 * ids across two assessments make any analysis that groups by question —
 * "which question does everyone get wrong" — silently merge two different
 * courses' results.
 */
function copyQuestions(questions = []) {
  return questions.map(({ _id, options = [], ...question }) => ({
    ...question,
    options: options.map(({ _id: optionId, ...option }) => option),
  }))
}

/**
 * A lesson's blocks, ready to belong to the copy.
 *
 * Two rewrites happen here. Block ids are dropped, because reading progress
 * points at them and shared ids would let a reader's place in the original
 * count towards the copy. And VIDEO / FILE blocks are re-pointed at the
 * copied rows: a lesson referencing content by id would otherwise still
 * name the *original* course's video, which is both the wrong video and a
 * way around that course's own access rules.
 *
 * A reference whose target was not copied (only possible if the data was
 * already inconsistent) drops the block rather than carrying a dangling id
 * into the new course — a missing paragraph is visible, a block pointing at
 * another course's video is not.
 */
function copyBlocks(blocks = [], { videoIdMap, materialIdMap, lessonId }) {
  const copied = []
  for (const { _id, ...block } of blocks) {
    if (block.type === 'VIDEO') {
      const videoId = videoIdMap.get(String(block.videoId))
      if (!videoId) {
        logger.warn('Dropped a lesson VIDEO block with no copied video while duplicating', {
          lessonId: String(lessonId),
          videoId: String(block.videoId),
        })
        continue
      }
      copied.push({ ...block, videoId })
      continue
    }
    if (block.type === 'FILE') {
      const materialId = materialIdMap.get(String(block.materialId))
      if (!materialId) {
        logger.warn('Dropped a lesson FILE block with no copied material while duplicating', {
          lessonId: String(lessonId),
          materialId: String(block.materialId),
        })
        continue
      }
      copied.push({ ...block, materialId })
      continue
    }
    copied.push(block)
  }
  return copied
}

export const courseDuplicateService = {
  async duplicate(actor, courseId, { title } = {}) {
    const source = await courseRepository.findById(courseId)
    if (!source) throw ApiError.notFound('Course not found')

    const sourceDoc = source.toObject()
    const newTitle = (title ?? '').trim() || `${sourceDoc.title} (copy)`

    const course = await Course.create(
      copyOf(sourceDoc, {
        title: newTitle,
        slug: await uniqueSlugFor(newTitle),
        // A copy always starts as a draft, whatever the original was. The
        // alternative is a click that publishes a half-edited duplicate of
        // a live course to everyone it targets.
        status: 'DRAFT',
        // The copy is version 1 of its own history, not a continuation of
        // the original's.
        version: 1,
        createdBy: actor.id,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
      })
    )

    const counts = { topics: 0, videos: 0, materials: 0, assessments: 0, lessons: 0, quizzes: 0 }

    // Old id -> new id, so children can be re-pointed as they are copied.
    const topicIdMap = new Map()
    const materialIdMap = new Map()
    const videoIdMap = new Map()

    const topics = await Topic.find({ courseId }).sort({ order: 1 }).lean()
    for (const topic of topics) {
      const created = await Topic.create(
        // The slug is kept: it is unique per course, not globally, and
        // changing it would break any link built against the original's
        // structure for no gain.
        copyOf(topic, { courseId: course._id, createdBy: actor.id, updatedBy: null })
      )
      topicIdMap.set(String(topic._id), created._id)
      counts.topics += 1
    }

    const videos = await Video.find({ courseId }).sort({ order: 1 }).lean()
    for (const video of videos) {
      const topicId = topicIdMap.get(String(video.topicId))
      // A video whose topic did not come across has nowhere to live. It can
      // only happen if the data is already inconsistent, and dropping it is
      // better than creating a row pointing at another course's topic.
      if (!topicId) {
        logger.warn('Skipped a video with no copied topic while duplicating', {
          courseId: String(courseId),
          videoId: String(video._id),
        })
        continue
      }
      const created = await Video.create(
        copyOf(video, { courseId: course._id, topicId, createdBy: actor.id, updatedBy: null })
      )
      videoIdMap.set(String(video._id), created._id)
      counts.videos += 1
    }

    const materials = await Material.find({ courseId }).sort({ order: 1 }).lean()
    for (const material of materials) {
      const topicId = topicIdMap.get(String(material.topicId))
      if (!topicId) continue
      const created = await Material.create(
        copyOf(material, { courseId: course._id, topicId, createdBy: actor.id, updatedBy: null })
      )
      // Kept for the lesson blocks below: a FILE block names a material by
      // id, so a copied lesson has to be re-pointed the same way a quiz is.
      materialIdMap.set(String(material._id), created._id)
      counts.materials += 1
    }

    const assessments = await Assessment.find({ courseId }).sort({ order: 1 }).lean()
    for (const assessment of assessments) {
      const topicId = topicIdMap.get(String(assessment.topicId))
      if (!topicId) continue
      await Assessment.create(
        copyOf(assessment, {
          courseId: course._id,
          topicId,
          questions: copyQuestions(assessment.questions),
          createdBy: actor.id,
          updatedBy: null,
        })
      )
      counts.assessments += 1
    }

    // Lessons copy like materials — a row per lesson, blocks and all (9.1).
    // Block ids are regenerated rather than carried across: they are what
    // reading progress points at, and two courses sharing block ids would
    // let a reader's place in the original count towards the copy.
    const lessons = await Lesson.find({ courseId }).sort({ order: 1 }).lean()
    for (const lesson of lessons) {
      const topicId = topicIdMap.get(String(lesson.topicId))
      if (!topicId) continue
      await Lesson.create(
        copyOf(lesson, {
          courseId: course._id,
          topicId,
          blocks: copyBlocks(lesson.blocks, { videoIdMap, materialIdMap, lessonId: lesson._id }),
          createdBy: actor.id,
          updatedBy: null,
        })
      )
      counts.lessons += 1
    }

    const quizzes = await Quiz.find({ courseId }).lean()
    for (const quiz of quizzes) {
      const videoId = videoIdMap.get(String(quiz.videoId))
      // videoId is uniquely indexed, so a quiz whose video was skipped has
      // to be skipped too rather than colliding with the original's.
      if (!videoId) continue
      await Quiz.create(
        copyOf(quiz, {
          courseId: course._id,
          videoId,
          questions: copyQuestions(quiz.questions),
          createdBy: actor.id,
          updatedBy: null,
        })
      )
      counts.quizzes += 1
    }

    // The course's own attention override, if it set one. The GLOBAL policy
    // has a null courseId and is not involved.
    const policy = await AttentionPolicy.findOne({ courseId }).lean()
    if (policy) {
      await AttentionPolicy.create(copyOf(policy, { courseId: course._id, updatedBy: actor.id }))
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_DUPLICATED',
      entity: 'Course',
      entityId: course._id.toString(),
      metadata: { sourceCourseId: String(courseId), sourceTitle: sourceDoc.title, ...counts },
    })

    return { course: toPublicCourse(course), counts }
  },
}
