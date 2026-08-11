import { ROLES } from '@lms/shared'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { computeAccessFlags } from './courseAssignmentAccess.js'

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
    return rows.map(toPublicAssignment)
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
