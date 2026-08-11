import { ROLES } from '@lms/shared'
import { taskRepository } from '../../repositories/task.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { notificationService } from '../notifications/notification.service.js'

function toPublicTask(task) {
  const now = new Date()
  const isOverdue = Boolean(
    ['TODO', 'IN_PROGRESS'].includes(task.status) && task.deadline && now > task.deadline
  )
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    assignedTo: task.assignedTo.toString(),
    assignedBy: task.assignedBy.toString(),
    priority: task.priority,
    deadline: task.deadline,
    attachments: task.attachments,
    status: task.status,
    // Never persisted as a literal state — derived so it's always accurate
    // without needing a scheduled job to flip it.
    effectiveStatus: isOverdue ? 'OVERDUE' : task.status,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

async function assertManagerScopeForAssignee(actor, assignedToId) {
  if (actor.roleName !== ROLES.MANAGER) return
  const [actorUser, targetUser] = await Promise.all([
    userRepository.findById(actor.id),
    userRepository.findById(assignedToId),
  ])
  if (!targetUser || targetUser.department !== actorUser.department) {
    throw ApiError.forbidden('Managers can only assign tasks within their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
  }
}

export const taskService = {
  async listMy(actor, query) {
    const rows = await taskRepository.listByAssignee({ assignedTo: actor.id, ...query })
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return { items: items.map(toPublicTask), nextCursor: hasMore ? items[items.length - 1]._id.toString() : null }
  },

  async listAssignedByMe(actor, query) {
    const rows = await taskRepository.listByAssigner({ assignedBy: actor.id, ...query })
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return { items: items.map(toPublicTask), nextCursor: hasMore ? items[items.length - 1]._id.toString() : null }
  },

  async getById(actor, id) {
    const task = await taskRepository.findById(id)
    if (!task) throw ApiError.notFound('Task not found')
    const isParty = task.assignedTo.toString() === actor.id || task.assignedBy.toString() === actor.id
    if (!isParty && actor.roleName !== ROLES.MANAGER) {
      throw ApiError.forbidden()
    }
    return toPublicTask(task)
  },

  async create(actor, payload) {
    const assignee = await userRepository.findById(payload.assignedTo)
    if (!assignee) throw ApiError.notFound('Assignee not found')
    await assertManagerScopeForAssignee(actor, payload.assignedTo)

    const task = await taskRepository.create({ ...payload, assignedBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'TASK_CREATED',
      entity: 'Task',
      entityId: task._id.toString(),
      metadata: { assignedTo: payload.assignedTo, title: task.title },
    })

    await notificationService.notify({
      userId: payload.assignedTo,
      type: 'TASK_ASSIGNED',
      title: `Task assigned: ${task.title}`,
      message: task.deadline ? `Deadline: ${new Date(task.deadline).toLocaleDateString()}` : '',
      relatedEntityType: 'Task',
      relatedEntityId: task._id.toString(),
    })

    return toPublicTask(task)
  },

  async update(actor, id, payload) {
    const existing = await taskRepository.findById(id)
    if (!existing) throw ApiError.notFound('Task not found')

    const isAssignee = existing.assignedTo.toString() === actor.id
    const isAssigner = existing.assignedBy.toString() === actor.id
    const canManageAll = actor.permissions?.includes('task:manage:all')

    if (!canManageAll && !isAssigner) {
      // The assignee (with no management permission) may only change status.
      if (!isAssignee || Object.keys(payload).some((key) => key !== 'status')) {
        throw ApiError.forbidden()
      }
    }

    if (canManageAll) await assertManagerScopeForAssignee(actor, existing.assignedTo.toString())

    const updateData = { ...payload }
    if (payload.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      updateData.completedAt = new Date()
    }

    const updated = await taskRepository.updateById(id, updateData)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'TASK_UPDATED',
      entity: 'Task',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicTask(updated)
  },

  async remove(actor, id) {
    const existing = await taskRepository.findById(id)
    if (!existing) throw ApiError.notFound('Task not found')
    if (existing.assignedBy.toString() !== actor.id && !actor.permissions?.includes('task:manage:all')) {
      throw ApiError.forbidden()
    }
    await taskRepository.deleteById(id)
    await auditLogRepository.record({ actor: actor.id, action: 'TASK_DELETED', entity: 'Task', entityId: id })
  },
}
