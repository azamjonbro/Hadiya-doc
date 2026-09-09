import { LearningPath } from '../../models/learningPath.model.js'
import { PathEnrollment } from '../../models/pathEnrollment.model.js'
import { Course } from '../../models/course.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { isVisibleToActor } from '../access/visibility.js'
import { slugify } from '../../utils/slugify.js'
import { ApiError } from '../../utils/ApiError.js'
import { PERMISSIONS } from '@lms/shared'
import { computeItemLocks, completedRefIdsFor, orderedItems, summarizeEnrollment } from './pathSequence.js'
import { pathEnrollmentService } from './pathEnrollment.service.js'

function canManage(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.PATH_MANAGE))
}

async function uniqueSlugFor(title) {
  const base = slugify(title)
  let slug = base
  let counter = 2
  while (await LearningPath.findOne({ slug })) {
    slug = `${base}-${counter}`
    counter += 1
  }
  return slug
}

function toPublicPath(path) {
  return {
    id: String(path._id),
    title: path.title,
    slug: path.slug,
    description: path.description ?? '',
    cover: path.cover ?? '',
    kind: path.kind,
    status: path.status,
    sequential: path.sequential,
    itemCount: (path.items ?? []).length,
    requiredCount: (path.items ?? []).filter((item) => item.required !== false).length,
    targetRoles: path.targetRoles ?? [],
    branches: path.branches ?? [],
    department: path.department ?? '',
    certificateTemplateId: path.certificateTemplateId ? String(path.certificateTemplateId) : null,
    validityDays: path.validityDays ?? 0,
    items: orderedItems(path).map((item) => ({
      id: String(item._id),
      type: item.type,
      refId: String(item.refId),
      order: item.order ?? 0,
      required: item.required !== false,
      prerequisiteIds: (item.prerequisiteIds ?? []).map(String),
    })),
    sections: (path.sections ?? []).map((section) => ({
      id: String(section._id),
      title: section.title,
      order: section.order ?? 0,
      itemIds: (section.itemIds ?? []).map(String),
    })),
    updatedAt: path.updatedAt,
  }
}

export const pathService = {
  /**
   * The catalog. Staff see everything; a learner sees published paths they
   * are targeted by, plus any they are already enrolled on.
   *
   * The enrolment override matters for the same reason it does on courses:
   * being put on a programme by an administrator is a deliberate act, and a
   * path assigned across a branch boundary would otherwise be invisible to
   * the person who has to complete it.
   */
  async list(actor, { kind, status } = {}) {
    const filter = { deletedAt: null }
    if (kind) filter.kind = kind
    if (canManage(actor)) {
      if (status) filter.status = status
    } else {
      filter.status = 'PUBLISHED'
    }

    const paths = await LearningPath.find(filter).sort({ createdAt: -1 }).lean()
    const enrollments = await PathEnrollment.find({ userId: actor.id }).lean()
    const enrollmentByPath = new Map(enrollments.map((row) => [String(row.pathId), row]))

    const items = []
    for (const path of paths) {
      const enrollment = enrollmentByPath.get(String(path._id))
      if (!canManage(actor)) {
        const visible = await isVisibleToActor(actor, path, { isAssigned: async () => Boolean(enrollment) })
        if (!visible) continue
      }
      items.push({
        ...toPublicPath(path),
        enrollment: enrollment
          ? {
              status: enrollment.status,
              completionPercent: enrollment.completionPercent,
              deadline: enrollment.deadline,
            }
          : null,
      })
    }
    return { items }
  },

  /**
   * One path, with the courses resolved and this learner's lock state.
   *
   * The lock state is computed here rather than in the client for the
   * obvious reason — the client cannot be trusted with it — and returned
   * anyway so the page can grey out what it must not open, instead of
   * letting somebody click through to a 403.
   */
  async getById(actor, id) {
    const path = await LearningPath.findOne({ _id: id, deletedAt: null }).lean()
    if (!path) throw ApiError.notFound('Path not found')

    const enrollment = await PathEnrollment.findOne({ userId: actor.id, pathId: id }).lean()
    if (!canManage(actor)) {
      if (path.status !== 'PUBLISHED') throw ApiError.notFound('Path not found')
      const visible = await isVisibleToActor(actor, path, { isAssigned: async () => Boolean(enrollment) })
      if (!visible) throw ApiError.notFound('Path not found')
    }

    const courseIds = orderedItems(path)
      .filter((item) => item.type === 'COURSE')
      .map((item) => item.refId)
    const courses = await Course.find({ _id: { $in: courseIds }, deletedAt: null }).lean()
    const courseById = new Map(courses.map((course) => [String(course._id), course]))

    const completed = enrollment ? await completedRefIdsFor(actor.id, path) : []
    const locks = computeItemLocks(path, completed)
    const summary = summarizeEnrollment(path, completed)
    const done = new Set(completed.map(String))

    return {
      ...toPublicPath(path),
      ...summary,
      enrollment: enrollment
        ? {
            status: enrollment.status,
            completionPercent: enrollment.completionPercent,
            deadline: enrollment.deadline,
            completedAt: enrollment.completedAt,
          }
        : null,
      items: orderedItems(path).map((item) => {
        const refId = String(item.refId)
        const course = courseById.get(refId)
        return {
          id: String(item._id),
          type: item.type,
          refId,
          order: item.order ?? 0,
          required: item.required !== false,
          // A course deleted out from under a path is reported rather than
          // dropped: an administrator has to be able to see the hole.
          title: course?.title ?? null,
          cover: course?.cover ?? '',
          estimatedMinutes: course?.estimatedMinutes ?? 0,
          missing: item.type === 'COURSE' && !course,
          completed: done.has(refId),
          locked: Boolean(locks[refId]?.locked),
          blockedBy: locks[refId]?.blockedBy ?? null,
        }
      }),
    }
  },

  /** Self-enrolment from the catalog. */
  async enrollSelf(actor, pathId) {
    const path = await LearningPath.findOne({ _id: pathId, deletedAt: null, status: 'PUBLISHED' }).lean()
    if (!path) throw ApiError.notFound('Path not found')
    const visible = await isVisibleToActor(actor, path, { isAssigned: async () => false })
    // Targeting is the gate: a path aimed at another department is not
    // something to opt into.
    if (!visible) throw ApiError.forbidden('This path is not open to you', 'PATH_NOT_AVAILABLE')

    await pathEnrollmentService.enroll(actor, actor.id, pathId, { mandatory: false })
    return this.getById(actor, pathId)
  },

  /** Assigning somebody else — path:assign. */
  async assign(actor, pathId, userId, options = {}) {
    const enrollment = await pathEnrollmentService.enroll(actor, userId, pathId, options)
    if (!enrollment) throw ApiError.notFound('Path not found')
    return { enrolled: true }
  },

  async create(actor, payload) {
    const path = await LearningPath.create({
      ...payload,
      slug: await uniqueSlugFor(payload.title),
      createdBy: actor.id,
    })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'PATH_CREATED',
      entity: 'LearningPath',
      entityId: path._id.toString(),
      metadata: { title: path.title, kind: path.kind },
    })
    return toPublicPath(path.toObject())
  },

  async update(actor, id, payload) {
    const path = await LearningPath.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { ...payload, updatedBy: actor.id } },
      { new: true, runValidators: true }
    )
    if (!path) throw ApiError.notFound('Path not found')

    await auditLogRepository.record({
      actor: actor.id,
      action: 'PATH_UPDATED',
      entity: 'LearningPath',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })

    // Changing the items changes what "finished" means, so everyone on the
    // path is re-evaluated — the same rule as editing a course's completion
    // rule (AT-04), one level up.
    if (payload.items) {
      const enrollments = await PathEnrollment.find({ pathId: id }, { userId: 1 }).lean()
      for (const enrollment of enrollments) {
        await pathEnrollmentService.evaluate(enrollment.userId, id).catch(() => null)
      }
    }

    return toPublicPath(path.toObject())
  },

  /**
   * Soft delete, like a course.
   *
   * Enrolments are left in place: somebody who completed this programme in
   * March has a certificate that says so, and a compliance report reads the
   * enrolment to explain it.
   */
  async remove(actor, id) {
    const path = await LearningPath.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    )
    if (!path) throw ApiError.notFound('Path not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'PATH_DELETED',
      entity: 'LearningPath',
      entityId: id,
      metadata: { title: path.title },
    })
    return { deleted: true }
  },

  /** Who is on this path, and how far — the admin's progress table. */
  async enrollments(pathId, { scopedUserIds = null } = {}) {
    const filter = { pathId }
    if (scopedUserIds) filter.userId = { $in: scopedUserIds }
    const rows = await PathEnrollment.find(filter)
      .populate('userId', 'fullName department branch')
      .sort({ completionPercent: -1 })
      .lean()
    return {
      items: rows.map((row) => ({
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        department: row.userId?.department ?? '',
        status: row.status,
        completionPercent: row.completionPercent,
        deadline: row.deadline,
        completedAt: row.completedAt,
      })),
    }
  },
}
