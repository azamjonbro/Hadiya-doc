import { PERMISSIONS } from '@lms/shared'
import { topicRepository } from '../../repositories/topic.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { slugify } from '../../utils/slugify.js'
import { ApiError } from '../../utils/ApiError.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'

const TOPIC_LIST_CACHE_TTL = 5 * 60
// Exported so course.service.js can invalidate this list when it deletes a
// whole course, rather than duplicating the key format on the other side.
export const topicListCacheKey = (courseId) => `topics:course:${courseId}`

function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

function toPublicTopic(topic) {
  return {
    id: topic._id.toString(),
    courseId: topic.courseId.toString(),
    title: topic.title,
    slug: topic.slug,
    description: topic.description,
    cover: topic.cover,
    banner: topic.banner,
    order: topic.order,
    status: topic.status,
    duration: topic.duration,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  }
}

async function ensureCourseExists(courseId) {
  const course = await courseRepository.findById(courseId)
  if (!course) throw ApiError.notFound('Course not found')
  return course
}

async function uniqueSlugForCourse(courseId, title) {
  const base = slugify(title) || 'topic'
  let slug = base
  let counter = 2
  while (await topicRepository.findByCourseAndSlug(courseId, slug)) {
    slug = `${base}-${counter}`
    counter += 1
  }
  return slug
}

export const topicService = {
  async listByCourse(actor, courseId) {
    const course = await ensureCourseExists(courseId)
    const canManage = canManageCourses(actor)
    if (course.status !== 'PUBLISHED' && !canManage) {
      throw ApiError.notFound('Course not found')
    }

    // Cached unfiltered (all statuses) — actor-independent — with
    // per-request visibility filtering applied after the cache read, same
    // pattern as course.service.js's getById.
    let allTopics = await cacheGet(topicListCacheKey(courseId))
    if (!allTopics) {
      const rows = await topicRepository.listByCourse(courseId)
      allTopics = rows.map(toPublicTopic)
      await cacheSet(topicListCacheKey(courseId), allTopics, TOPIC_LIST_CACHE_TTL)
    }

    return canManage ? allTopics : allTopics.filter((t) => t.status === 'PUBLISHED')
  },

  async getById(actor, id) {
    const topic = await topicRepository.findById(id)
    if (!topic) throw ApiError.notFound('Topic not found')
    const canManage = canManageCourses(actor)
    if (topic.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Topic not found')
    const course = await courseRepository.findById(topic.courseId)
    if (course?.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Topic not found')
    return toPublicTopic(topic)
  },

  async create(actor, courseId, payload) {
    await ensureCourseExists(courseId)
    const slug = await uniqueSlugForCourse(courseId, payload.title)
    const topic = await topicRepository.create({ ...payload, courseId, slug, createdBy: actor.id })
    await cacheDel(topicListCacheKey(courseId))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'TOPIC_CREATED',
      entity: 'Topic',
      entityId: topic._id.toString(),
      metadata: { courseId, title: topic.title },
    })
    return toPublicTopic(topic)
  },

  async update(actor, id, payload) {
    const existing = await topicRepository.findById(id)
    if (!existing) throw ApiError.notFound('Topic not found')
    const updated = await topicRepository.updateById(id, { ...payload, updatedBy: actor.id })
    await cacheDel(topicListCacheKey(existing.courseId.toString()))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'TOPIC_UPDATED',
      entity: 'Topic',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicTopic(updated)
  },

  async remove(actor, id) {
    const existing = await topicRepository.findById(id)
    if (!existing) throw ApiError.notFound('Topic not found')
    await topicRepository.deleteById(id)
    await cacheDel(topicListCacheKey(existing.courseId.toString()))
    await auditLogRepository.record({ actor: actor.id, action: 'TOPIC_DELETED', entity: 'Topic', entityId: id })
  },
}
