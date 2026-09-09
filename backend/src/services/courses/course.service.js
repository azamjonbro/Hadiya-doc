import { PERMISSIONS } from '@lms/shared'
import { courseRepository } from '../../repositories/course.repository.js'
import { videoRepository } from '../../repositories/video.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { materialRepository } from '../../repositories/material.repository.js'
import { materialProgressRepository } from '../../repositories/materialProgress.repository.js'
import { assessmentRepository } from '../../repositories/assessment.repository.js'
import { assessmentAttemptRepository } from '../../repositories/assessmentAttempt.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { courseCascadeRepository } from '../../repositories/courseCascade.repository.js'
import { slugify } from '../../utils/slugify.js'
import { ApiError } from '../../utils/ApiError.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'
import { isCourseVisibleToActor } from './courseVisibility.js'
import { computeLockState, orderedCourseVideos } from './courseSequence.js'
import { topicListCacheKey } from './topic.service.js'
import { effectiveCacheKey as attentionPolicyCacheKey } from './attentionPolicy.service.js'
import { notificationService } from '../notifications/notification.service.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'
import { collectCourseItems, summarize, courseCompletionService } from './courseCompletion.service.js'
import { logger } from '../../config/logger.js'

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

async function computeCourseProgress(actor, id, targetUserId) {
  const course = await courseRepository.findById(id)
  if (!course) throw ApiError.notFound('Course not found')
  if (course.status !== 'PUBLISHED' && !canManageCourses(actor)) throw ApiError.notFound('Course not found')

  const videos = await videoRepository.listByCourse(id)
  const visibleVideos = canManageCourses(actor) ? videos : videos.filter((v) => v.status === 'PUBLISHED')
  const progressRows = await videoProgressRepository.listByUserAndCourse(targetUserId, id)
  const progressByVideoId = new Map(progressRows.map((p) => [p.videoId.toString(), p]))

  // Lock state travels with progress because the curriculum needs both to
  // draw a row, and they are computed from the same completion data — two
  // endpoints would only give them a chance to disagree.
  const orderedVideos = await orderedCourseVideos(id, { publishedOnly: !canManageCourses(actor) })
  const locks = computeLockState(orderedVideos, progressByVideoId)

  const totalVideos = visibleVideos.length
  let completedVideos = 0
  const videoProgress = {}
  for (const video of visibleVideos) {
    const videoId = video._id.toString()
    const progress = progressByVideoId.get(videoId)
    const completed = Boolean(progress?.completedAt)
    if (completed) completedVideos += 1
    videoProgress[videoId] = {
      completionPercent: progress?.completionPercent ?? 0,
      completed,
      // Staff review any lesson freely; only learners are sequenced.
      locked: canManageCourses(actor) ? false : Boolean(locks[videoId]?.locked),
      blockedBy: locks[videoId]?.blockedBy ?? null,
    }
  }

  // Everything a topic can hold counts, not just video. A course whose only
  // content is one presentation and one test used to sit at "0% (0/0)"
  // forever — there were no videos to complete, so there was nothing to
  // divide by.
  //
  // Each item carries the same weight, and a document contributes the
  // fraction of its pages that were actually read: two slides of a hundred is
  // 2% of that item, not nothing and not all of it. Videos and tests stay
  // all-or-nothing, which is what completing them already meant.
  const [materials, materialRows, assessments, attempts] = await Promise.all([
    materialRepository.listByCourse(id),
    materialProgressRepository.listByUserAndCourse(targetUserId, id),
    assessmentRepository.listByCourse(id),
    assessmentAttemptRepository.listByUserAndCourse(targetUserId, id),
  ])

  const visibleMaterials = canManageCourses(actor) ? materials : materials.filter((m) => m.status === 'PUBLISHED')
  const visibleAssessments = canManageCourses(actor)
    ? assessments
    : assessments.filter((a) => a.status === 'PUBLISHED')

  const materialRowById = new Map(materialRows.map((row) => [row.materialId.toString(), row]))
  const materialProgress = {}
  for (const material of visibleMaterials) {
    const materialId = material._id.toString()
    const row = materialRowById.get(materialId)
    materialProgress[materialId] = {
      completionPercent: row?.completionPercent ?? 0,
      viewedPages: row?.viewedPages?.length ?? 0,
      totalPages: row?.totalPages ?? 0,
      completed: Boolean(row?.completedAt),
    }
  }

  // A test is done when it has been passed. An attempt that failed is a try,
  // not a completion, and counting it would let a course reach 100% with
  // nothing learned.
  const passedAssessmentIds = new Set(
    attempts.filter((a) => a.passed).map((a) => a.assessmentId.toString())
  )
  const assessmentProgress = {}
  for (const assessment of visibleAssessments) {
    const assessmentId = assessment._id.toString()
    assessmentProgress[assessmentId] = { completed: passedAssessmentIds.has(assessmentId) }
  }

  // The percentage comes from the completion service, not from a second
  // calculation here (3.1). Two implementations of "how far through is this
  // person" is how the progress endpoint and the assignment status came to
  // disagree in the first place — a learner could read 100% and hold an
  // ACTIVE assignment, or the reverse. One call, one answer (AT-03).
  //
  // Staff previewing a course see draft items in the per-item maps above,
  // but the headline number is always the learner's: completion is judged on
  // published content, and a draft lesson must not drag a course to 80% on
  // the page that says whether it is finished.
  const summary = summarize(await collectCourseItems(id, targetUserId, { publishedOnly: true }))

  return {
    completionPercent: summary.completionPercent,
    completedItems: summary.completedItems,
    totalItems: summary.totalItems,
    // Kept for the callers that still speak in videos (the sequencing UI, the
    // admin's per-course table).
    completedVideos,
    totalVideos,
    videos: videoProgress,
    materials: materialProgress,
    assessments: assessmentProgress,
  }
}

export function toPublicCourse(course) {
  return {
    id: course._id.toString(),
    title: course.title,
    slug: course.slug,
    description: course.description,
    cover: course.cover,
    banner: course.banner,
    status: course.status,
    targetRoles: course.targetRoles ?? [],
    branches: course.branches ?? [],
    department: course.department ?? '',
    // Catalog metadata (3.4). Defaults are spelled out rather than left
    // undefined: courses created before these fields existed have none of
    // them stored, and a catalog card that reads `level: undefined` renders
    // as a blank chip instead of "Beginner".
    categoryId: course.categoryId ? course.categoryId.toString() : null,
    tags: course.tags ?? [],
    level: course.level ?? 'BEGINNER',
    authorIds: (course.authorIds ?? []).map((id) => id.toString()),
    estimatedMinutes: course.estimatedMinutes ?? 0,
    prerequisiteCourseIds: (course.prerequisiteCourseIds ?? []).map((id) => id.toString()),
    certificateTemplateId: course.certificateTemplateId ? course.certificateTemplateId.toString() : null,
    navigationMode: course.navigationMode ?? 'SEQUENTIAL',
    validityDays: course.validityDays ?? 0,
    version: course.version ?? 1,
    allowSelfEnroll: course.allowSelfEnroll ?? false,
    completionRule: {
      minPercent: course.completionRule?.minPercent ?? 100,
      requireAllRequired: course.completionRule?.requireAllRequired ?? true,
    },
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  }
}

// No-op unless explicitly requested and the course actually has a
// role/branch/department restriction to auto-assign against — never
// mass-assigns literally every active user just because `autoAssign` was
// checked. Reads targeting from the persisted `course` doc, not the raw
// payload, so a partial update that omits targetRoles/branches/department
// still uses the real (previously saved) restriction rather than treating it
// as unset.
async function autoAssignIfNeeded(actor, course, autoAssign) {
  if (!autoAssign) return
  const roleNames = course.targetRoles ?? []
  const branches = course.branches ?? []
  const department = course.department ?? ''
  if (!roleNames.length && !branches.length && !department) return

  const users = await userRepository.listActiveByRolesAndDepartment({ roleNames, branches, department })
  const userIds = users.map((u) => u._id.toString())
  if (!userIds.length) return

  const existing = await courseAssignmentRepository.listByUsersAndCourses(userIds, [course._id.toString()])
  const existingUserIds = new Set(existing.map((a) => a.userId.toString()))
  const rows = userIds
    .filter((userId) => !existingUserIds.has(userId))
    .map((userId) => ({ userId, courseId: course._id, mandatory: true, assignedBy: actor.id }))
  if (!rows.length) return

  await courseAssignmentRepository.insertManyIgnoringDuplicates(rows)

  for (const row of rows) {
    try {
      await notificationService.notify({
        userId: row.userId,
        type: 'COURSE_ASSIGNED',
        vars: { courseTitle: course.title, deadline: formatNotificationDate(row.deadline) },
        relatedEntityType: 'Course',
        relatedEntityId: course._id.toString(),
      })
    } catch {
      // Best-effort — a notification failure must not undo the assignment.
    }
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
    let effectiveQuery = query
    if (!canManageCourses(actor)) {
      const [actorUser, assignments] = await Promise.all([
        userRepository.findById(actor.id),
        // Assigned courses are visible regardless of targeting, so the catalog
        // has to know about them here too — otherwise a course an admin
        // deliberately assigned across branches would open by direct link but
        // never appear in the list it was assigned into.
        courseAssignmentRepository.listByUser(actor.id),
      ])
      effectiveQuery = {
        ...query,
        status: 'PUBLISHED',
        visibleToRoleName: actor.roleName,
        visibleToBranch: actorUser?.branch ?? '',
        visibleToDepartment: actorUser?.department ?? '',
        assignedCourseIds: assignments.map((a) => a.courseId),
      }
    }
    // Numbered pagination: the client needs a total to render "page 3 of 7",
    // so this mode pays for a count query that cursor mode does not.
    if (query.page) {
      const [rows, total] = await Promise.all([
        courseRepository.listPage(effectiveQuery),
        courseRepository.count(effectiveQuery),
      ])
      return {
        items: rows.map(toPublicCourse),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      }
    }

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
    if (!canManageCourses(actor) && !(await isCourseVisibleToActor(actor, course))) {
      throw ApiError.notFound('Course not found')
    }
    return course
  },

  // Real per-user completion, computed from VideoProgress.completedAt —
  // there's no cached/denormalized field for this, so it's derived on read
  // rather than trusted from anywhere else (spec: no fabricated progress).
  async getMyProgress(actor, id) {
    return computeCourseProgress(actor, id, actor.id)
  },

  // Same computation, but for a manager/admin looking at someone else's
  // progress (e.g. the employee detail page) — gated on analytics:view:all
  // since that's the existing permission for "view another user's data".
  async getProgressForUser(actor, id, targetUserId) {
    if (actor.id !== targetUserId && !actor.permissions?.includes(PERMISSIONS.ANALYTICS_VIEW_ALL)) {
      throw ApiError.forbidden('Missing required permission: analytics:view:all')
    }
    return computeCourseProgress(actor, id, targetUserId)
  },

  async create(actor, payload) {
    const { autoAssign, ...courseFields } = payload
    const slug = await uniqueSlugFor(payload.title)
    const course = await courseRepository.create({ ...courseFields, slug, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_CREATED',
      entity: 'Course',
      entityId: course._id.toString(),
      metadata: { title: course.title },
    })
    if (payload.status === 'PUBLISHED') await autoAssignIfNeeded(actor, course, payload.autoAssign)
    return toPublicCourse(course)
  },

  async update(actor, id, payload) {
    const existing = await courseRepository.findById(id)
    if (!existing) throw ApiError.notFound('Course not found')
    const { autoAssign, ...courseFields } = payload
    const updated = await courseRepository.updateById(id, { ...courseFields, updatedBy: actor.id })
    await cacheDel(courseCacheKey(id))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_UPDATED',
      entity: 'Course',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    if (payload.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      await autoAssignIfNeeded(actor, updated, payload.autoAssign)
    }
    // Changing what "finished" means changes who has finished. Editing the
    // rule and leaving every assignment on the old answer is exactly the
    // split-brain 3.1 removed, so the re-evaluation runs here for the same
    // reason publishing a new lesson triggers one (AT-04).
    if (payload.completionRule) {
      await courseCompletionService.evaluateCourse(id).catch((error) => {
        logger.warn('Could not re-evaluate completion after a rule change', {
          courseId: String(id),
          error: error.message,
        })
      })
    }
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

  // "Delete" from the admin's point of view: the course leaves every listing
  // at once, but nothing is dropped yet. It sits on the trash page until it
  // is restored or destroyed for good — deleting a course cascades into its
  // topics, videos, assignments and analytics, which is far too much to hang
  // on one confirmation dialog being clicked correctly.
  async moveToTrash(actor, id) {
    const existing = await courseRepository.findById(id)
    if (!existing) throw ApiError.notFound('Course not found')

    const trashed = await courseRepository.softDelete(id, actor.id)
    await cacheDel(courseCacheKey(id))
    await cacheDel(topicListCacheKey(id))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_TRASHED',
      entity: 'Course',
      entityId: id,
      metadata: { title: existing.title, slug: existing.slug },
    })
    return toPublicCourse(trashed)
  },

  // The trash page itself. Capped rather than paginated: a bin that needs a
  // pager is a bin nobody is emptying.
  async listTrash() {
    const rows = await courseRepository.listTrashed()
    return { items: rows.map((course) => ({ ...toPublicCourse(course), deletedAt: course.deletedAt })) }
  },

  async restore(actor, id) {
    const existing = await courseRepository.findAnyById(id)
    if (!existing) throw ApiError.notFound('Course not found')
    if (!existing.deletedAt) throw ApiError.badRequest('Course is not in the trash', 'COURSE_NOT_TRASHED')

    const restored = await courseRepository.restore(id)
    await cacheDel(courseCacheKey(id))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_RESTORED',
      entity: 'Course',
      entityId: id,
      metadata: { title: existing.title },
    })
    return toPublicCourse(restored)
  },

  // Permanent counterpart to moveToTrash(): the course and everything hanging
  // off it are gone for good. Restricted to SUPERADMIN at the route layer,
  // and reachable only from the trash — course:delete alone buys you the
  // reversible step.
  //
  // Note this deletes database rows only. Uploaded video objects (originals
  // and HLS segments) stay in S3, since removing them means walking a whole
  // key prefix per video and is not something a half-finished pass should
  // be left in the middle of.
  async destroy(actor, id) {
    const existing = await courseRepository.findAnyById(id)
    if (!existing) throw ApiError.notFound('Course not found')

    // Read the video ids up front — VideoAnalyticsEvent rows only carry a
    // videoId, so after the Video rows are deleted there is nothing left to
    // match them on.
    const videos = await videoRepository.listByCourse(id)
    const videoIds = videos.map((v) => v._id)

    const deleted = await courseCascadeRepository.deleteByCourse(existing._id, videoIds)
    await courseRepository.deleteById(id)

    await cacheDel(courseCacheKey(id))
    await cacheDel(topicListCacheKey(id))
    await cacheDel(attentionPolicyCacheKey(id))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_DELETED',
      entity: 'Course',
      entityId: id,
      metadata: { title: existing.title, slug: existing.slug, deleted },
    })

    return { id, title: existing.title, deleted }
  },
}
