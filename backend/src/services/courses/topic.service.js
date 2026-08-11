import { PERMISSIONS } from '@lms/shared'
import { topicRepository } from '../../repositories/topic.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { slugify } from '../../utils/slugify.js'
import { ApiError } from '../../utils/ApiError.js'

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
    const rows = await topicRepository.listByCourse(courseId)
    const visible = canManage ? rows : rows.filter((t) => t.status === 'PUBLISHED')
    return visible.map(toPublicTopic)
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
    await auditLogRepository.record({ actor: actor.id, action: 'TOPIC_DELETED', entity: 'Topic', entityId: id })
  },
}
