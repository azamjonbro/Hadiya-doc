import { groupRepository } from '../../repositories/group.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { notificationService } from '../notifications/notification.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'
import { formatNotificationDate } from '../../utils/notificationFormat.js'
import { hasUnscopedAccess } from '../access/actorScope.js'
import { groupMembershipService } from './groupMembership.service.js'

function toPublicGroup(group) {
  return {
    id: group._id.toString(),
    name: group.name,
    description: group.description,
    department: group.department,
    memberIds: group.memberIds.map((id) => id.toString()),
    courseIds: group.courseIds.map((id) => id.toString()),
    memberCount: group.memberIds.length,
    courseCount: group.courseIds.length,
    // Defaulted rather than left undefined: groups created before 5.5 have
    // no `type` stored, and a card that reads "undefined" beside the member
    // count is worse than one that says what those groups actually are.
    type: group.type ?? 'STATIC',
    rule: {
      roles: group.rule?.roles ?? [],
      departments: group.rule?.departments ?? [],
      branches: group.rule?.branches ?? [],
      positions: group.rule?.positions ?? [],
    },
    membersRefreshedAt: group.membersRefreshedAt ?? null,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }
}

function toPublicMember(user) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    jshshir: user.jshshir,
    email: user.email ?? '',
    avatar: user.avatar,
    department: user.department,
    position: user.position,
    isActive: user.isActive,
  }
}

function toPublicCourse(course) {
  return {
    id: course._id.toString(),
    title: course.title,
    slug: course.slug,
    cover: course.cover,
    status: course.status,
  }
}

async function actorDepartment(actor) {
  const actorUser = await userRepository.findById(actor.id)
  return actorUser?.department ?? ''
}

// A MANAGER only ever sees and edits groups inside their own department —
// the same department fence the rest of the admin app applies to users,
// assignments and tasks.
async function assertManagerScopeForGroup(actor, group) {
  if (hasUnscopedAccess(actor)) return
  if (group.department !== (await actorDepartment(actor))) {
    throw ApiError.forbidden('Managers can only manage groups in their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
  }
}

async function assertManagerScopeForUsers(actor, users) {
  if (hasUnscopedAccess(actor)) return
  const department = await actorDepartment(actor)
  const outsider = users.find((user) => user.department !== department)
  if (outsider) {
    throw ApiError.forbidden('Managers can only add users from their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
  }
}

async function loadGroupOr404(id) {
  const group = await groupRepository.findById(id)
  if (!group) throw ApiError.notFound('Group not found')
  return group
}

// Opens every given course to every given member, skipping pairs that are
// already enrolled. Returns the pairs it actually created, so only genuinely
// new enrolments generate a notification.
async function openCoursesToMembers({ actor, groupId, userIds, courseIds }) {
  if (!userIds.length || !courseIds.length) return []

  const existing = await courseAssignmentRepository.listByUsersAndCourses(userIds, courseIds)
  const existingKeys = new Set(existing.map((a) => `${a.userId}:${a.courseId}`))

  const rows = []
  for (const userId of userIds) {
    for (const courseId of courseIds) {
      if (existingKeys.has(`${userId}:${courseId}`)) continue
      rows.push({ userId, courseId, mandatory: true, assignedBy: actor.id, groupId })
    }
  }
  if (!rows.length) return []

  await courseAssignmentRepository.insertManyIgnoringDuplicates(rows)
  return rows
}

async function notifyEnrolments(rows) {
  if (!rows.length) return
  const courses = await courseRepository.findByIds([...new Set(rows.map((r) => r.courseId.toString()))])
  const titleById = new Map(courses.map((c) => [c._id.toString(), c.title]))

  for (const row of rows) {
    // Best-effort: a notification failure must not undo an enrolment that
    // is already committed.
    try {
      await notificationService.notify({
        userId: row.userId,
        type: 'COURSE_ASSIGNED',
        vars: {
          courseTitle: titleById.get(row.courseId.toString()) ?? '',
          deadline: formatNotificationDate(row.deadline),
        },
        relatedEntityType: 'Course',
        relatedEntityId: row.courseId.toString(),
      })
    } catch (error) {
      logger.warn('Failed to notify group enrolment', { userId: row.userId, courseId: row.courseId, error: error.message })
    }
  }
}

/**
 * A dynamic group's membership belongs to its rule.
 *
 * Refused rather than allowed-and-reverted: a hand-added member would
 * disappear at the next refresh, and the person who added them would have
 * no way to know why.
 */
function assertNotDynamic(group) {
  if (group.type === 'DYNAMIC') {
    throw ApiError.badRequest(
      'This group\'s members come from its rule — edit the rule instead',
      'GROUP_IS_DYNAMIC'
    )
  }
}

export const groupService = {
  async list(actor, query = {}) {
    const department = hasUnscopedAccess(actor) ? query.department : await actorDepartment(actor)
    const groups = await groupRepository.listAll({ search: query.search, department })
    return groups.map(toPublicGroup)
  },

  async getById(actor, id) {
    const group = await loadGroupOr404(id)
    await assertManagerScopeForGroup(actor, group)

    const [members, courses] = await Promise.all([
      group.memberIds.length ? userRepository.findByIds(group.memberIds) : [],
      group.courseIds.length ? courseRepository.findByIds(group.courseIds) : [],
    ])

    return {
      ...toPublicGroup(group),
      members: members.map(toPublicMember).sort((a, b) => a.fullName.localeCompare(b.fullName)),
      courses: courses.map(toPublicCourse).sort((a, b) => a.title.localeCompare(b.title)),
    }
  },

  async create(actor, payload) {
    const department =
      hasUnscopedAccess(actor) ? payload.department ?? '' : await actorDepartment(actor)

    let group
    try {
      group = await groupRepository.create({
        name: payload.name,
        description: payload.description ?? '',
        department,
        type: payload.type ?? 'STATIC',
        rule: payload.rule ?? {},
        createdBy: actor.id,
      })
    } catch (error) {
      if (error.code === 11000) throw ApiError.conflict('A group with this name already exists', 'GROUP_ALREADY_EXISTS')
      throw error
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'GROUP_CREATED',
      entity: 'Group',
      entityId: group._id.toString(),
      metadata: { name: group.name },
    })

    // Members and courses can be supplied at creation time so "create the
    // group and put these five people in it" is one call, not three.
    //
    // The bulk variant, not addMembers: the roster often comes from a
    // selection made on the employees page minutes earlier, and one id that
    // has since stopped resolving must not leave a group created with nobody
    // in it and a 404 on the way out.
    if (group.type === 'DYNAMIC') {
      // Populated at once rather than at the next nightly pass: a group
      // created from a rule and showing nobody looks broken, and the first
      // thing somebody does is add members by hand.
      await groupMembershipService.refresh(group._id)
    } else {
      if (payload.memberIds?.length) await this.addMembersBulk(actor, group._id.toString(), payload.memberIds)
    }
    if (payload.courseIds?.length) await this.addCourses(actor, group._id.toString(), payload.courseIds)

    return this.getById(actor, group._id.toString())
  },

  async update(actor, id, payload) {
    const group = await loadGroupOr404(id)
    await assertManagerScopeForGroup(actor, group)

    const updateData = { updatedBy: actor.id }
    if (payload.name !== undefined) updateData.name = payload.name
    if (payload.description !== undefined) updateData.description = payload.description
    if (payload.rule !== undefined) updateData.rule = payload.rule
    // Switching a curated list to a rule is allowed — that is how an
    // existing group is converted — but it replaces the membership at the
    // next line, so it is worth doing knowingly.
    if (payload.type !== undefined) updateData.type = payload.type
    // A manager can't move a group out of their own department.
    if (payload.department !== undefined && hasUnscopedAccess(actor)) {
      updateData.department = payload.department
    }

    let updated
    try {
      updated = await groupRepository.updateById(id, updateData)
    } catch (error) {
      if (error.code === 11000) throw ApiError.conflict('A group with this name already exists', 'GROUP_ALREADY_EXISTS')
      throw error
    }

    // A changed rule changes who is in the group, so the membership is
    // rebuilt in the same request rather than at the next nightly pass —
    // otherwise the person who just edited it sees the old list and edits
    // it again.
    if (updated?.type === 'DYNAMIC' && (payload.rule !== undefined || payload.type !== undefined)) {
      await groupMembershipService.refresh(updated._id).catch((error) => {
        logger.warn('Could not refresh the group after its rule changed', {
          groupId: String(updated._id),
          error: error.message,
        })
      })
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'GROUP_UPDATED',
      entity: 'Group',
      entityId: id,
      metadata: { fields: Object.keys(updateData) },
    })

    return toPublicGroup(updated)
  },

  async remove(actor, id) {
    const group = await loadGroupOr404(id)
    await assertManagerScopeForGroup(actor, group)

    // Enrolments this group created go with it; anything assigned by hand
    // stays, because it was never the group's to take away.
    await courseAssignmentRepository.deleteByGroup({ groupId: group._id })
    await groupRepository.deleteById(id)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'GROUP_DELETED',
      entity: 'Group',
      entityId: id,
      metadata: { name: group.name },
    })
  },

  async addMembers(actor, id, userIds) {
    const group = await loadGroupOr404(id)
    assertNotDynamic(group)
    await assertManagerScopeForGroup(actor, group)

    const users = await userRepository.findByIds(userIds)
    if (users.length !== userIds.length) throw ApiError.notFound('One or more users not found')
    await assertManagerScopeForUsers(actor, users)

    const updated = await groupRepository.addMembers(id, userIds, actor.id)

    // New members immediately get every course the group already has open.
    const created = await openCoursesToMembers({
      actor,
      groupId: updated._id,
      userIds,
      courseIds: updated.courseIds.map((courseId) => courseId.toString()),
    })
    await notifyEnrolments(created)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'GROUP_MEMBERS_ADDED',
      entity: 'Group',
      entityId: id,
      metadata: { userIds, enrolmentsCreated: created.length },
    })

    return this.getById(actor, id)
  },

  // The employees table's "add the selection to a group". Unlike addMembers
  // above this never refuses the whole batch: ids that no longer resolve to a
  // user (someone deleted while the selection sat on screen) and people who
  // are already in the group are reported back rather than thrown, so the
  // admin learns what actually happened instead of losing the operation.
  async addMembersBulk(actor, id, userIds) {
    const group = await loadGroupOr404(id)
    assertNotDynamic(group)
    await assertManagerScopeForGroup(actor, group)

    const wanted = [...new Set(userIds.map(String))]
    const users = await userRepository.findByIds(wanted)
    const foundIds = new Set(users.map((user) => user._id.toString()))
    const notFoundIds = wanted.filter((userId) => !foundIds.has(userId))
    await assertManagerScopeForUsers(actor, users)

    const existing = new Set(group.memberIds.map(String))
    const alreadyMemberIds = [...foundIds].filter((userId) => existing.has(userId))
    const toAdd = [...foundIds].filter((userId) => !existing.has(userId))

    // Nothing resolvable at all is a real failure; "everyone was already in
    // the group" is not — it is the answer to the question that was asked.
    if (!toAdd.length && !alreadyMemberIds.length) {
      throw ApiError.notFound('None of the selected employees could be found')
    }

    if (toAdd.length) {
      const updated = await groupRepository.addMembers(id, toAdd, actor.id)

      // New members immediately get every course the group already has open —
      // the same rule addMembers applies.
      const created = await openCoursesToMembers({
        actor,
        groupId: updated._id,
        userIds: toAdd,
        courseIds: updated.courseIds.map((courseId) => courseId.toString()),
      })
      await notifyEnrolments(created)

      await auditLogRepository.record({
        actor: actor.id,
        action: 'GROUP_MEMBERS_ADDED',
        entity: 'Group',
        entityId: id,
        metadata: { userIds: toAdd, enrolmentsCreated: created.length, bulk: true },
      })
    }

    return {
      group: await this.getById(actor, id),
      requested: wanted.length,
      added: toAdd.length,
      addedIds: toAdd,
      alreadyMemberIds,
      notFoundIds,
    }
  },

  // The mirror image: only people who are actually in the group leave it, and
  // the ones who were never in it are reported rather than treated as an
  // error. The employees themselves are untouched — this removes a membership
  // and the course access that membership opened, nothing else.
  async removeMembersBulk(actor, id, userIds) {
    const group = await loadGroupOr404(id)
    assertNotDynamic(group)
    await assertManagerScopeForGroup(actor, group)

    const wanted = [...new Set(userIds.map(String))]
    const existing = new Set(group.memberIds.map(String))
    const toRemove = wanted.filter((userId) => existing.has(userId))
    const notMemberIds = wanted.filter((userId) => !existing.has(userId))

    if (toRemove.length) {
      await groupRepository.removeMembers(id, toRemove, actor.id)
      await courseAssignmentRepository.deleteByGroup({ groupId: group._id, userIds: toRemove })

      await auditLogRepository.record({
        actor: actor.id,
        action: 'GROUP_MEMBERS_REMOVED',
        entity: 'Group',
        entityId: id,
        metadata: { userIds: toRemove, bulk: true },
      })
    }

    return {
      group: await this.getById(actor, id),
      requested: wanted.length,
      removed: toRemove.length,
      removedIds: toRemove,
      notMemberIds,
    }
  },

  async removeMember(actor, id, userId) {
    const group = await loadGroupOr404(id)
    assertNotDynamic(group)
    await assertManagerScopeForGroup(actor, group)

    await groupRepository.removeMember(id, userId, actor.id)
    await courseAssignmentRepository.deleteByGroup({ groupId: group._id, userIds: [userId] })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'GROUP_MEMBER_REMOVED',
      entity: 'Group',
      entityId: id,
      metadata: { userId },
    })

    return this.getById(actor, id)
  },

  async addCourses(actor, id, courseIds) {
    const group = await loadGroupOr404(id)
    await assertManagerScopeForGroup(actor, group)

    const courses = await courseRepository.findByIds(courseIds)
    if (courses.length !== courseIds.length) throw ApiError.notFound('One or more courses not found')

    const updated = await groupRepository.addCourses(id, courseIds, actor.id)

    const created = await openCoursesToMembers({
      actor,
      groupId: updated._id,
      userIds: updated.memberIds.map((memberId) => memberId.toString()),
      courseIds,
    })
    await notifyEnrolments(created)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'GROUP_COURSES_ADDED',
      entity: 'Group',
      entityId: id,
      metadata: { courseIds, enrolmentsCreated: created.length },
    })

    return this.getById(actor, id)
  },

  async removeCourse(actor, id, courseId) {
    const group = await loadGroupOr404(id)
    await assertManagerScopeForGroup(actor, group)

    await groupRepository.removeCourse(id, courseId, actor.id)
    await courseAssignmentRepository.deleteByGroup({ groupId: group._id, courseIds: [courseId] })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'GROUP_COURSE_REMOVED',
      entity: 'Group',
      entityId: id,
      metadata: { courseId },
    })

    return this.getById(actor, id)
  },
}
