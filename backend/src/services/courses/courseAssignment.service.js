import { ROLES } from '@lms/shared'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { computeAccessFlags } from './courseAssignmentAccess.js'
import { notificationService } from '../notifications/notification.service.js'
import { isCourseVisibleToActor } from './courseVisibility.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'

function toPublicAssignment(assignment) {
  return {
    id: assignment._id.toString(),
    userId: assignment.userId.toString(),
    courseId: assignment.courseId.toString(),
    mandatory: assignment.mandatory,
    assignedBy: assignment.assignedBy.toString(),
    assignedAt: assignment.assignedAt,
    startAt: assignment.startAt,
    deadline: assignment.deadline,
    expiresAt: assignment.expiresAt,
    status: assignment.status,
    ...computeAccessFlags(assignment),
  }
}

async function assertManagerScopeForUser(actor, targetUserId) {
  if (actor.roleName !== ROLES.MANAGER) return
  const [actorUser, targetUser] = await Promise.all([
    userRepository.findById(actor.id),
    userRepository.findById(targetUserId),
  ])
  if (!targetUser || targetUser.department !== actorUser.department) {
    throw ApiError.forbidden(
      'Managers can only manage assignments within their own department',
      'DEPARTMENT_SCOPE_FORBIDDEN'
    )
  }
}

async function filterToManagerDepartment(actor, assignments) {
  const actorUser = await userRepository.findById(actor.id)
  const users = await userRepository.findByIds(assignments.map((a) => a.userId))
  const departmentByUserId = new Map(users.map((u) => [u._id.toString(), u.department]))
  return assignments.filter((a) => departmentByUserId.get(a.userId.toString()) === actorUser.department)
}

export const courseAssignmentService = {
  async assign(actor, courseId, payload) {
    const course = await courseRepository.findById(courseId)
    if (!course) throw ApiError.notFound('Course not found')
    const targetUser = await userRepository.findById(payload.userId)
    if (!targetUser) throw ApiError.notFound('User not found')

    await assertManagerScopeForUser(actor, payload.userId)

    let assignment
    try {
      assignment = await courseAssignmentRepository.create({
        userId: payload.userId,
        courseId,
        mandatory: payload.mandatory,
        assignedBy: actor.id,
        startAt: payload.startAt ?? null,
        deadline: payload.deadline ?? null,
        expiresAt: payload.expiresAt ?? null,
      })
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.conflict('This course is already assigned to this user', 'ASSIGNMENT_ALREADY_EXISTS')
      }
      throw error
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_ASSIGNED',
      entity: 'CourseAssignment',
      entityId: assignment._id.toString(),
      metadata: { userId: payload.userId, courseId },
    })

    await notificationService.notify({
      userId: payload.userId,
      type: 'COURSE_ASSIGNED',
      vars: { courseTitle: course.title, deadline: formatNotificationDate(payload.deadline) },
      relatedEntityType: 'Course',
      relatedEntityId: courseId,
    })

    return toPublicAssignment(assignment)
  },

  // Self-enroll: the acting user assigns themselves, so there's no manager
  // department scope to check and no "assignedBy someone else" notion —
  // mandatory is always false and there's no deadline, unlike an
  // admin/manager assignment (spec: self-enrolled courses aren't a mandate).
  async selfEnroll(actor, courseId) {
    const course = await courseRepository.findById(courseId)
    if (!course) throw ApiError.notFound('Course not found')
    if (course.status !== 'PUBLISHED') throw ApiError.notFound('Course not found')
    if (!(await isCourseVisibleToActor(actor, course))) throw ApiError.notFound('Course not found')

    const existing = await courseAssignmentRepository.findByUserAndCourse(actor.id, courseId)
    if (existing) return toPublicAssignment(existing)

    let assignment
    try {
      assignment = await courseAssignmentRepository.create({
        userId: actor.id,
        courseId,
        mandatory: false,
        assignedBy: actor.id,
      })
    } catch (error) {
      if (error.code === 11000) {
        assignment = await courseAssignmentRepository.findByUserAndCourse(actor.id, courseId)
      } else {
        throw error
      }
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_SELF_ENROLLED',
      entity: 'CourseAssignment',
      entityId: assignment._id.toString(),
      metadata: { courseId },
    })

    return toPublicAssignment(assignment)
  },

  async listForCourse(actor, courseId) {
    const course = await courseRepository.findById(courseId)
    if (!course) throw ApiError.notFound('Course not found')
    const rows = await courseAssignmentRepository.listByCourse(courseId)
    const scoped = actor.roleName === ROLES.MANAGER ? await filterToManagerDepartment(actor, rows) : rows
    return scoped.map(toPublicAssignment)
  },

  async listForUser(actor, targetUserId) {
    const isSelf = actor.id === targetUserId
    if (!isSelf) {
      await assertManagerScopeForUser(actor, targetUserId)
    }
    const rows = await courseAssignmentRepository.listByUser(targetUserId)

    // An assignment whose course is in the trash points at something the
    // reader can no longer open — the course endpoints answer 404 for it. The
    // assignment row is kept (restoring the course brings it back intact) but
    // it stays out of the list until then.
    const courses = await courseRepository.findByIds(rows.map((row) => row.courseId))
    const liveCourseIds = new Set(courses.map((course) => course._id.toString()))
    return rows.filter((row) => liveCourseIds.has(row.courseId.toString())).map(toPublicAssignment)
  },

  async update(actor, assignmentId, payload) {
    const existing = await courseAssignmentRepository.findById(assignmentId)
    if (!existing) throw ApiError.notFound('Assignment not found')
    await assertManagerScopeForUser(actor, existing.userId.toString())
    const updated = await courseAssignmentRepository.updateById(assignmentId, payload)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_ASSIGNMENT_UPDATED',
      entity: 'CourseAssignment',
      entityId: assignmentId,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicAssignment(updated)
  },

  async remove(actor, assignmentId) {
    const existing = await courseAssignmentRepository.findById(assignmentId)
    if (!existing) throw ApiError.notFound('Assignment not found')
    await assertManagerScopeForUser(actor, existing.userId.toString())
    await courseAssignmentRepository.deleteById(assignmentId)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_ASSIGNMENT_REMOVED',
      entity: 'CourseAssignment',
      entityId: assignmentId,
    })
  },
}
