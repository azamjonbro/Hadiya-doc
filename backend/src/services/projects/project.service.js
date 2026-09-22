import { PERMISSIONS } from '@lms/shared'
import { Project } from '../../models/project.model.js'
import { Course } from '../../models/course.model.js'
import { User } from '../../models/user.model.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { containsRegex } from '../../utils/escapeRegex.js'

/**
 * Projects: folders for the admin library (see project.model.js).
 *
 * Two levels of say-so. A person with `course:delete` — the admin tier —
 * sees and manages every project, the way the reference's account owner
 * does. Everyone else sees the projects they own or were added to, and may
 * change only the ones they own. `course:create` is what lets someone make
 * a project at all: a folder is for the people who author into it.
 */
function isAdmin(actor) {
  return Boolean(actor?.permissions?.includes(PERMISSIONS.COURSE_DELETE))
}

function isOwner(project, actor) {
  return String(project.ownerId) === String(actor.id)
}

function memberOf(project, userId) {
  return project.members.find((m) => String(m.userId) === String(userId)) ?? null
}

function accessFor(project, actor) {
  if (isAdmin(actor) || isOwner(project, actor)) return 'OWNER'
  return memberOf(project, actor.id)?.access ?? null
}

// A name card, the same shape everywhere a member is drawn: the reference's
// row is avatar, name, role badge, email — nothing a learner's profile
// would need `user:read` for.
function toCard(user, role) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email ?? '',
    avatar: user.avatar ?? '',
    position: user.position ?? '',
    role: role?.name ?? null,
  }
}

async function cardsFor(users) {
  const roles = await roleRepository.findAll()
  const roleById = new Map(roles.map((r) => [r._id.toString(), r]))
  return users.map((u) => toCard(u, roleRepository.effectiveFrom(u, roleById)))
}

function toPublicProject(project, { actor, courseCount = 0, owner = null, members = [] } = {}) {
  return {
    id: project._id.toString(),
    name: project.name,
    ownerId: String(project.ownerId),
    owner,
    members,
    memberCount: project.members.length,
    courseCount,
    access: actor ? accessFor(project, actor) : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

async function requireProject(id) {
  const project = await Project.findById(id)
  if (!project) throw ApiError.notFound('Project not found', 'PROJECT_NOT_FOUND')
  return project
}

function requireVisible(project, actor) {
  if (!accessFor(project, actor)) throw ApiError.notFound('Project not found', 'PROJECT_NOT_FOUND')
}

function requireManage(project, actor) {
  if (accessFor(project, actor) !== 'OWNER') {
    throw ApiError.forbidden('Only the project owner can change the project', 'PROJECT_OWNER_ONLY')
  }
}

async function countCourses(projectIds) {
  if (!projectIds.length) return new Map()
  const rows = await Course.aggregate([
    { $match: { projectId: { $in: projectIds }, deletedAt: null } },
    { $group: { _id: '$projectId', n: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [String(r._id), r.n]))
}

export const projectService = {
  // The sidebar list: every project for an admin, otherwise the ones the
  // person is in. Sorted by name — a folder list is read, not scrolled by
  // recency.
  async list(actor) {
    const filter = isAdmin(actor) ? {} : { $or: [{ ownerId: actor.id }, { 'members.userId': actor.id }] }
    const projects = await Project.find(filter).sort({ name: 1 }).lean()
    const counts = await countCourses(projects.map((p) => p._id))
    return projects.map((p) => toPublicProject(p, { actor, courseCount: counts.get(String(p._id)) ?? 0 }))
  },

  async getById(actor, id) {
    const project = await requireProject(id)
    requireVisible(project, actor)
    return this.detail(project, actor)
  },

  // The management dialog's view: the owner first, then every member with
  // their card. One user lookup for the lot.
  async detail(project, actor) {
    const ids = [String(project.ownerId), ...project.members.map((m) => String(m.userId))]
    const users = await userRepository.findByIds([...new Set(ids)])
    const cards = new Map((await cardsFor(users)).map((c) => [c.id, c]))
    const owner = cards.get(String(project.ownerId)) ?? null
    // A member whose account was since deleted has no card; the row is
    // dropped rather than drawn blank.
    const members = project.members
      .map((m) => {
        const card = cards.get(String(m.userId))
        return card ? { ...card, access: m.access, addedAt: m.addedAt } : null
      })
      .filter(Boolean)
    const counts = await countCourses([project._id])
    return toPublicProject(project, { actor, owner, members, courseCount: counts.get(String(project._id)) ?? 0 })
  },

  // Made first, named after: the reference creates «Новый проект (Ism
  // Familiya)» the moment "+" is pressed and opens the rename dialog over
  // it. A name given up front is honoured as is.
  async create(actor, { name } = {}) {
    let title = name?.trim()
    if (!title) {
      const me = await userRepository.findById(actor.id)
      title = `Yangi loyiha (${me?.fullName ?? ''})`.replace(' ()', '')
    }
    const project = await Project.create({ name: title, ownerId: actor.id, createdBy: actor.id, members: [] })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'PROJECT_CREATED',
      entity: 'Project',
      entityId: project._id.toString(),
      metadata: { name: title },
    })
    return this.detail(project, actor)
  },

  async rename(actor, id, name) {
    const project = await requireProject(id)
    requireManage(project, actor)
    const previous = project.name
    project.name = name.trim()
    await project.save()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'PROJECT_RENAMED',
      entity: 'Project',
      entityId: id,
      metadata: { from: previous, to: project.name },
    })
    return this.detail(project, actor)
  },

  // Deleting the folder, not its contents: the courses fall back into the
  // general library with their assignments and progress untouched. A
  // project is an organising device, and losing a course because someone
  // tidied up a folder is the wrong trade.
  async remove(actor, id) {
    const project = await requireProject(id)
    requireManage(project, actor)
    const result = await Course.updateMany({ projectId: project._id }, { $set: { projectId: null } })
    await Project.deleteOne({ _id: project._id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'PROJECT_DELETED',
      entity: 'Project',
      entityId: id,
      metadata: { name: project.name, coursesReleased: result.modifiedCount ?? 0 },
    })
    return { id, coursesReleased: result.modifiedCount ?? 0 }
  },

  // Adding someone twice updates their access rather than making a second
  // row; adding the owner is a no-op — they are already everything.
  async addMembers(actor, id, { userIds, access }) {
    const project = await requireProject(id)
    requireManage(project, actor)
    const users = await userRepository.findByIds(userIds)
    const known = new Set(users.map((u) => String(u._id)))
    let added = 0
    for (const userId of userIds) {
      if (!known.has(userId) || userId === String(project.ownerId)) continue
      const existing = memberOf(project, userId)
      if (existing) {
        existing.access = access
      } else {
        project.members.push({ userId, access })
        added += 1
      }
    }
    await project.save()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'PROJECT_MEMBERS_ADDED',
      entity: 'Project',
      entityId: id,
      metadata: { userIds, access, added },
    })
    return this.detail(project, actor)
  },

  async setMemberAccess(actor, id, userId, access) {
    const project = await requireProject(id)
    requireManage(project, actor)
    const member = memberOf(project, userId)
    if (!member) throw ApiError.notFound('Member not found', 'PROJECT_MEMBER_NOT_FOUND')
    member.access = access
    await project.save()
    return this.detail(project, actor)
  },

  async removeMember(actor, id, userId) {
    const project = await requireProject(id)
    // A member may leave on their own; anyone else's row takes the owner.
    if (String(userId) !== String(actor.id)) requireManage(project, actor)
    const before = project.members.length
    project.members = project.members.filter((m) => String(m.userId) !== String(userId))
    if (project.members.length === before) throw ApiError.notFound('Member not found', 'PROJECT_MEMBER_NOT_FOUND')
    await project.save()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'PROJECT_MEMBER_REMOVED',
      entity: 'Project',
      entityId: id,
      metadata: { userId },
    })
    return this.detail(project, actor)
  },

  // The "add members" picker: active colleagues, by name or email. Name
  // cards only, so an author without `user:read` can still fill their own
  // project.
  async candidates(actor, { search, limit }) {
    const filter = { isActive: true, _id: { $ne: actor.id } }
    if (search) {
      const regex = containsRegex(search)
      filter.$or = [{ fullName: regex }, { email: regex }]
    }
    const users = await User.find(filter).sort({ fullName: 1 }).limit(limit)
    return { items: await cardsFor(users) }
  },

  // Called by the course service before it files a course into a project:
  // the folder must exist and the person must be allowed to write to it.
  async assertCanFile(actor, projectId) {
    if (!projectId) return
    const project = await Project.findById(projectId)
    if (!project) throw ApiError.badRequest('Project not found', 'PROJECT_NOT_FOUND')
    const access = accessFor(project, actor)
    if (access !== 'OWNER' && access !== 'EDIT') {
      throw ApiError.forbidden('You can only view this project', 'PROJECT_VIEW_ONLY')
    }
  },
}
