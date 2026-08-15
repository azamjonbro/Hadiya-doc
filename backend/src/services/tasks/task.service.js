import { Types } from 'mongoose'
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
    audienceType: task.audienceType ?? 'USER',
    audienceValue: task.audienceValue ?? '',
    batchId: task.batchId ? task.batchId.toString() : null,
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

// Who a newly created task actually lands on. A single assignee stays a
// single document; a position or company-wide assignment fans out to one
// document per person so everyone carries their own status and deadline.
async function resolveRecipients(actor, payload) {
  if (payload.assigneeType === 'USER') {
    const assignee = await userRepository.findById(payload.assignedTo)
    if (!assignee) throw ApiError.notFound('Assignee not found')
    await assertManagerScopeForAssignee(actor, payload.assignedTo)
    return [assignee]
  }

  // Managers broadcast inside their own department only — the same scope
  // rule that applies when they pick one person by hand.
  let department
  if (actor.roleName === ROLES.MANAGER) {
    const actorUser = await userRepository.findById(actor.id)
    department = actorUser?.department
    if (!department) {
      throw ApiError.forbidden(
        'Managers can only assign tasks within their own department',
        'DEPARTMENT_SCOPE_FORBIDDEN'
      )
    }
  }

  const users = await userRepository.listActive({
    department,
    position: payload.assigneeType === 'POSITION' ? payload.position.trim() : undefined,
  })
  // The assigner is not a recipient of their own broadcast.
  const recipients = users.filter((user) => user._id.toString() !== actor.id)
  if (!recipients.length) {
    throw ApiError.badRequest('No active employees match this audience', 'NO_TASK_RECIPIENTS')
  }
  return recipients
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

// Only the assigner — or someone holding task:manage:all — may move or delete
// a whole fan-out, the same rule single-task update applies. `fromStatus`
// scopes the change to the copies sitting in the board column the card was
// dragged out of, so moving "To do" does not drag the finished copies with it.
async function loadBatch(actor, batchId, fromStatus) {
  // A malformed id would otherwise reach Mongoose as a cast error and
  // surface as a 500 instead of the 404 it actually is.
  if (!Types.ObjectId.isValid(batchId)) throw ApiError.notFound('Task batch not found')

  const scope = actor.permissions?.includes('task:manage:all') ? {} : { assignedBy: actor.id }
  const tasks = await taskRepository.listByBatch({ batchId, ...scope, fromStatus })
  // Selecting by `assignedBy` is what authorises the call, so "not yours"
  // and "does not exist" answer alike — an assigner has no business
  // learning which batch ids other assigners hold.
  if (!tasks.length) throw ApiError.notFound('Task batch not found')
  return tasks
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

  // Everything the assigner's kanban board draws, in one shot: every copy
  // of every task they wrote, each already carrying its own status and
  // assignee name. The board groups fan-outs into single cards itself —
  // it needs the individual rows anyway to show who in a group is done.
  //
  // Unpaginated (capped in the repository) on purpose. The board renders
  // all four columns at once, and a cursor page would both truncate them
  // and make a card's recipient count wrong: one company-wide assignment
  // can be more rows than the old 20-row page held.
  async listBoard(actor) {
    const rows = await taskRepository.listBoardByAssigner({ assignedBy: actor.id })
    return { items: await hydrateAssignees(rows) }
  },

  // Dragging a batch card moves every copy it stands for.
  async updateBatch(actor, batchId, { status, fromStatus }) {
    const tasks = await loadBatch(actor, batchId, fromStatus)

    // A batch can already hold copies in the target state (a card dropped
    // back where it came from, or `fromStatus` omitted by a non-board
    // client). Writing those would reset completedAt and announce a change
    // that never happened.
    const affected = tasks.filter((task) => task.status !== status)
    if (!affected.length) return { batchId, status, affected: 0 }

    const updateData = { status }
    if (status === 'COMPLETED') updateData.completedAt = new Date()

    await taskRepository.updateByIds(
      affected.map((task) => task._id),
      updateData
    )
    await auditLogRepository.record({
      actor: actor.id,
      action: 'TASK_BATCH_UPDATED',
      entity: 'Task',
      entityId: batchId,
      metadata: { status, fromStatus: fromStatus ?? null, affected: affected.length },
    })

    // The same fan-out create() runs. Moving a card is still a change to
    // each recipient's own task, so it must not reach them more quietly
    // than the original assignment did.
    const event = status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED'
    await Promise.all(
      affected.map(async (task) => {
        const assigneeId = task.assignedTo.toString()
        await notificationService.notify({
          userId: assigneeId,
          type: event,
          title:
            status === 'COMPLETED' ? `Task completed: ${task.title}` : `Task status changed: ${task.title}`,
          message: `${task.status} → ${status}`,
          relatedEntityType: 'Task',
          relatedEntityId: task._id.toString(),
        })
        // The loaded doc still carries the old status; the card posted to
        // chat should read as the state the recipient now has.
        await postTaskSystemMessage({
          fromUserId: actor.id,
          toUserId: assigneeId,
          event,
          task: Object.assign(task, { status }),
        })
      })
    )

    return { batchId, status, affected: affected.length }
  },

  async removeBatch(actor, batchId, { fromStatus } = {}) {
    const tasks = await loadBatch(actor, batchId, fromStatus)
    await taskRepository.deleteByIds(tasks.map((task) => task._id))

    await auditLogRepository.record({
      actor: actor.id,
      action: 'TASK_BATCH_DELETED',
      entity: 'Task',
      entityId: batchId,
      metadata: { fromStatus: fromStatus ?? null, affected: tasks.length },
    })

    return { batchId, affected: tasks.length }
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
    const { assigneeType, position, title, description, priority, deadline, attachments } = payload
    const recipients = await resolveRecipients(actor, payload)

    // A single assignee keeps its own document ungrouped; a fan-out gets a
    // shared batch id so the origin of every copy stays traceable.
    const batchId = recipients.length > 1 ? new Types.ObjectId() : null
    const audienceValue = assigneeType === 'POSITION' ? position.trim() : ''

    const created = await taskRepository.createMany(
      recipients.map((user) => ({
        title,
        description,
        priority,
        deadline,
        attachments,
        assignedTo: user._id,
        assignedBy: actor.id,
        audienceType: assigneeType,
        audienceValue,
        batchId,
      }))
    )

    await auditLogRepository.record({
      actor: actor.id,
      action: 'TASK_CREATED',
      entity: 'Task',
      entityId: created[0]._id.toString(),
      metadata: {
        title,
        audienceType: assigneeType,
        audienceValue,
        recipientCount: created.length,
        batchId: batchId ? batchId.toString() : null,
      },
    })

    // A bell notification is easy to miss; the assignment also lands in
    // the DM between assigner and assignee as a system card, so it sits in
    // the same thread where they will actually discuss it. Failing to post
    // it must never fail the assignment itself.
    await Promise.all(
      created.map(async (task) => {
        await notificationService.notify({
          userId: task.assignedTo.toString(),
          type: 'TASK_ASSIGNED',
          title: `Task assigned: ${task.title}`,
          message: task.deadline ? `Deadline: ${new Date(task.deadline).toLocaleDateString()}` : '',
          relatedEntityType: 'Task',
          relatedEntityId: task._id.toString(),
        })
        await postTaskSystemMessage({
          fromUserId: actor.id,
          toUserId: task.assignedTo.toString(),
          event: 'TASK_ASSIGNED',
          task,
        })
      })
    )

    const usersById = new Map(recipients.map((user) => [user._id.toString(), user]))
    return {
      audienceType: assigneeType,
      audienceValue,
      batchId: batchId ? batchId.toString() : null,
      count: created.length,
      items: created.map((task) => toPublicTask(task, usersById.get(task.assignedTo.toString()))),
    }
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
