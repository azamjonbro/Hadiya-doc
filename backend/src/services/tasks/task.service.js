import { ROLES } from '@lms/shared'
import { taskRepository } from '../../repositories/task.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { notificationService } from '../notifications/notification.service.js'
import { chatService } from '../chat/chat.service.js'
import { logger } from '../../config/logger.js'

function toPublicTask(task, assignee) {
  const now = new Date()
  const isOverdue = Boolean(
    ['TODO', 'IN_PROGRESS'].includes(task.status) && task.deadline && now > task.deadline
  )
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    assignedTo: task.assignedTo.toString(),
    assigneeName: assignee?.fullName ?? '',
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

async function hydrateAssignees(tasks) {
  const userIds = [...new Set(tasks.map((task) => task.assignedTo.toString()))]
  const users = await userRepository.findByIds(userIds)
  const usersById = new Map(users.map((u) => [u._id.toString(), u]))
  return tasks.map((task) => toPublicTask(task, usersById.get(task.assignedTo.toString())))
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

// Chat delivery is a convenience on top of the notification, never a
// precondition for it — a storage hiccup here must not roll back a task
// that was already created.
async function postTaskSystemMessage({ fromUserId, toUserId, event, task }) {
  try {
    await chatService.postSystemMessage({
      fromUserId,
      toUserId,
      event,
      entityType: 'Task',
      entityId: task._id.toString(),
      params: {
        title: task.title,
        priority: task.priority ?? '',
        deadline: task.deadline ? new Date(task.deadline).toISOString() : '',
        status: task.status ?? '',
      },
      preview: task.title,
    })
  } catch (error) {
    logger.warn('Failed to post task system message to chat', {
      taskId: task._id.toString(),
      event,
      error: error instanceof Error ? error.message : error,
    })
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
    return { items: await hydrateAssignees(items), nextCursor: hasMore ? items[items.length - 1]._id.toString() : null }
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

    // A bell notification is easy to miss; the assignment also lands in
    // the DM between assigner and assignee as a system card, so it sits in
    // the same thread where they will actually discuss it. Failing to post
    // it must never fail the assignment itself.
    await postTaskSystemMessage({
      fromUserId: actor.id,
      toUserId: payload.assignedTo,
      event: 'TASK_ASSIGNED',
      task,
    })

    return toPublicTask(task, assignee)
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

    // A status change is the other half of the loop: the assigner asked
    // for something, so they hear back the same way the assignee was told.
    if (payload.status && payload.status !== existing.status) {
      const counterpartId = isAssignee ? existing.assignedBy.toString() : existing.assignedTo.toString()
      const event = payload.status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED'

      await notificationService.notify({
        userId: counterpartId,
        type: event,
        title:
          payload.status === 'COMPLETED'
            ? `Task completed: ${updated.title}`
            : `Task status changed: ${updated.title}`,
        message: `${existing.status} → ${payload.status}`,
        relatedEntityType: 'Task',
        relatedEntityId: id,
      })

      await postTaskSystemMessage({ fromUserId: actor.id, toUserId: counterpartId, event, task: updated })
    }

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
