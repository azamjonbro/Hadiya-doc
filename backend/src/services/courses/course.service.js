import { PERMISSIONS } from '@lms/shared'
import { courseRepository } from '../../repositories/course.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { slugify } from '../../utils/slugify.js'
import { ApiError } from '../../utils/ApiError.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'

// Course metadata is read on every catalog/detail page view and written
// rarely (spec §39) — cached actor-independently (the DTO doesn't vary by
// caller) with per-request visibility still enforced against the cached
// value, and invalidated on every write below.
const COURSE_CACHE_TTL = 5 * 60
const courseCacheKey = (id) => `course:${id}`

// Anyone without course:create (i.e. not admin-tier) only ever sees
// published courses — draft/archived content isn't exposed to the catalog.
function canManageCourses(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.COURSE_CREATE))
}

function toPublicCourse(course) {
  return {
    id: course._id.toString(),
    title: course.title,
    slug: course.slug,
    description: course.description,
    cover: course.cover,
    banner: course.banner,
    status: course.status,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  }
}

async function uniqueSlugFor(title) {
  const base = slugify(title) || 'course'
  let slug = base
  let counter = 2
  while (await courseRepository.findBySlug(slug)) {
    slug = `${base}-${counter}`
    counter += 1
  }
  return slug
}

export const courseService = {
  async list(actor, query) {
    const effectiveQuery = canManageCourses(actor) ? query : { ...query, status: 'PUBLISHED' }
    const rows = await courseRepository.listPage(effectiveQuery)
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return {
      items: items.map(toPublicCourse),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
    }
  },

  async getById(actor, id) {
    let course = await cacheGet(courseCacheKey(id))
    if (!course) {
      const doc = await courseRepository.findById(id)
      if (!doc) throw ApiError.notFound('Course not found')
      course = toPublicCourse(doc)
      await cacheSet(courseCacheKey(id), course, COURSE_CACHE_TTL)
    }
    if (course.status !== 'PUBLISHED' && !canManageCourses(actor)) {
      throw ApiError.notFound('Course not found')
    }
    return course
  },

  async create(actor, payload) {
    const slug = await uniqueSlugFor(payload.title)
    const course = await courseRepository.create({ ...payload, slug, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_CREATED',
      entity: 'Course',
      entityId: course._id.toString(),
      metadata: { title: course.title },
    })
    return toPublicCourse(course)
  },

  async update(actor, id, payload) {
    const existing = await courseRepository.findById(id)
    if (!existing) throw ApiError.notFound('Course not found')
    const updated = await courseRepository.updateById(id, { ...payload, updatedBy: actor.id })
    await cacheDel(courseCacheKey(id))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_UPDATED',
      entity: 'Course',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicCourse(updated)
  },

  async archive(actor, id) {
    const existing = await courseRepository.findById(id)
    if (!existing) throw ApiError.notFound('Course not found')
    const updated = await courseRepository.archive(id)
    await cacheDel(courseCacheKey(id))
    await auditLogRepository.record({ actor: actor.id, action: 'COURSE_ARCHIVED', entity: 'Course', entityId: id })
    return toPublicCourse(updated)
  },
}
