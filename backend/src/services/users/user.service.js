import { ROLES } from '@lms/shared'
import { userRepository } from '../../repositories/user.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { hashPassword } from '../../utils/hash.js'
import { ApiError } from '../../utils/ApiError.js'
import { courseAssignmentService } from '../courses/courseAssignment.service.js'
import { logger } from '../../config/logger.js'

const EMPLOYEE_TIER_ROLES = [ROLES.EMPLOYEE, ROLES.CALL_OPERATOR, ROLES.SELLER]

function toPublicUser(user, role) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    jshshir: user.jshshir,
    // Normalised to '' for the clients: the field is absent on documents where
    // it was never filled in, and a v-model bound to `undefined` warns.
    passportSeries: user.passportSeries ?? '',
    email: user.email ?? '',
    phone: user.phone,
    branch: user.branch ?? '',
    department: user.department,
    position: user.position,
    avatar: user.avatar,
    isActive: user.isActive,
    role: role?.name ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

// Three unique fields can now collide, and "Username or email already in use"
// sent an admin hunting through the wrong one. Mongo names the offending index
// in the error, so say which value is taken.
const DUPLICATE_FIELD_MESSAGES = {
  jshshir: 'This JSHSHIR is already registered to another employee',
  passportSeries: 'This passport series is already registered to another employee',
  email: 'This email is already registered to another employee',
}

function duplicateIdentityError(error) {
  const field = Object.keys(error.keyPattern ?? {}).find((key) => key in DUPLICATE_FIELD_MESSAGES)
  return ApiError.conflict(
    DUPLICATE_FIELD_MESSAGES[field] ?? 'JSHSHIR, passport series or email already in use',
    'USER_ALREADY_EXISTS'
  )
}

async function resolveRole(roleName) {
  const role = await roleRepository.findByName(roleName)
  if (!role) throw ApiError.badRequest(`Unknown role: ${roleName}`, 'UNKNOWN_ROLE')
  return role
}

// A MANAGER may only create/update/deactivate EMPLOYEE-tier accounts within
// their own department — enforced here, not just hidden in the admin UI.
async function assertManagerCanManage(actor, role, department) {
  if (actor.roleName !== ROLES.MANAGER) return

  if (!EMPLOYEE_TIER_ROLES.includes(role.name)) {
    throw ApiError.forbidden('Managers can only manage employee-tier accounts', 'ROLE_SCOPE_FORBIDDEN')
  }
  const actorUser = await userRepository.findById(actor.id)
  if (department !== actorUser.department) {
    throw ApiError.forbidden('Managers can only manage users within their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
  }
}

async function assertManagerCanView(actor, department) {
  if (actor.roleName !== ROLES.MANAGER) return
  const actorUser = await userRepository.findById(actor.id)
  if (department !== actorUser.department) {
    throw ApiError.forbidden('Managers can only view users within their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
  }
}

export const userService = {
  async list(actor, query) {
    const roleFilter = query.role ? await roleRepository.findByName(query.role) : null
    let department = query.department

    if (actor.roleName === ROLES.MANAGER) {
      const actorUser = await userRepository.findById(actor.id)
      department = actorUser.department
    }

    const params = {
      search: query.search,
      roleId: roleFilter?._id,
      branch: query.branch,
      department,
      isActive: query.status === 'active' ? true : query.status === 'inactive' ? false : undefined,
      cursor: query.cursor,
      page: query.page,
      limit: query.limit,
    }

    const roles = await roleRepository.findAll()
    const roleById = new Map(roles.map((r) => [r._id.toString(), r]))
    const serialize = (rows) => rows.map((u) => toPublicUser(u, roleById.get(u.roleId.toString())))

    // Numbered pagination: the client needs a total to render "page 3 of 7",
    // so this mode pays for a count query that cursor mode does not.
    if (query.page) {
      const [rows, total] = await Promise.all([userRepository.listPage(params), userRepository.count(params)])
      return {
        items: serialize(rows),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      }
    }

    const rows = await userRepository.listPage(params)
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows

    return {
      items: serialize(items),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
    }
  },

  // Options for the admin list's department filter. A manager only ever
  // sees their own department in the list itself (see list() above), so
  // offering them any other department here would be a filter that can
  // only ever return nothing.
  async listDepartments(actor) {
    if (actor.roleName === ROLES.MANAGER) {
      const actorUser = await userRepository.findById(actor.id)
      return actorUser?.department ? [actorUser.department] : []
    }
    return userRepository.listDepartments()
  },

  // Options for the branch pickers — the admin list filter, the user form and
  // the course targeting selector. Unlike departments, a manager is not fenced
  // to their own branch (the department fence is the one the app enforces), so
  // this is the same list for everyone who can read users.
  async listBranches() {
    return userRepository.listBranches()
  },

  // The admin branches page: every branch name in use, with what is attached
  // to it. Built from the user and course records rather than from a branches
  // collection, because there isn't one — a branch is a value people are
  // tagged with, not an entity.
  async branchOverview() {
    const [people, courses] = await Promise.all([
      userRepository.branchStats(),
      courseRepository.countsByBranch(),
    ])
    const byName = new Map()
    for (const row of people) {
      byName.set(row._id, { name: row._id, employees: row.total, activeEmployees: row.active, courses: 0 })
    }
    for (const row of courses) {
      const existing = byName.get(row._id)
      if (existing) existing.courses = row.courses
      // A branch that only a course mentions still belongs on the page —
      // usually it means a course was targeted at an office before anyone
      // was moved into it, which is exactly the mistake worth seeing.
      else byName.set(row._id, { name: row._id, employees: 0, activeEmployees: 0, courses: row.courses })
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  },

  // Options for "assign this task to a whole position". A manager may only
  // assign inside their own department, so they are offered the job titles
  // that exist there — anything else would resolve to zero recipients.
  async listPositions(actor) {
    if (actor.roleName === ROLES.MANAGER) {
      const actorUser = await userRepository.findById(actor.id)
      return actorUser?.department ? userRepository.listPositions({ department: actorUser.department }) : []
    }
    return userRepository.listPositions()
  },

  async getById(actor, id) {
    const user = await userRepository.findById(id)
    if (!user) throw ApiError.notFound('User not found')
    await assertManagerCanView(actor, user.department)
    const role = await roleRepository.findById(user.roleId)
    return toPublicUser(user, role)
  },

  async create(actor, payload) {
    const role = await resolveRole(payload.roleName)
    await assertManagerCanManage(actor, role, payload.department ?? '')

    const passwordHash = await hashPassword(payload.password)
    let user
    try {
      user = await userRepository.create({
        fullName: payload.fullName,
        jshshir: payload.jshshir,
        // Left off the document entirely when blank — see user.model.js on why
        // these must be absent rather than '' or null.
        passportSeries: payload.passportSeries || undefined,
        email: payload.email || undefined,
        phone: payload.phone ?? '',
        passwordHash,
        roleId: role._id,
        branch: payload.branch ?? '',
        department: payload.department ?? '',
        position: payload.position ?? '',
        isActive: payload.isActive ?? true,
      })
    } catch (error) {
      if (error.code === 11000) throw duplicateIdentityError(error)
      throw error
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user._id.toString(),
      metadata: { jshshir: user.jshshir, role: role.name },
    })

    // Best-effort: a course that no longer exists shouldn't roll back the
    // account that was just created, so failures here are logged, not thrown.
    for (const courseId of payload.courseIds ?? []) {
      try {
        await courseAssignmentService.assign(actor, courseId, { userId: user._id.toString(), mandatory: true })
      } catch (error) {
        logger.warn('Failed to assign course during user creation', {
          userId: user._id.toString(),
          courseId,
          error: error.message,
        })
      }
    }

    return toPublicUser(user, role)
  },

  async update(actor, id, payload) {
    const existing = await userRepository.findById(id)
    if (!existing) throw ApiError.notFound('User not found')

    let role = await roleRepository.findById(existing.roleId)
    if (payload.roleName) {
      role = await resolveRole(payload.roleName)
    }
    await assertManagerCanManage(actor, role, payload.department ?? existing.department)

    const updateData = {}
    if (payload.fullName !== undefined) updateData.fullName = payload.fullName
    if (payload.phone !== undefined) updateData.phone = payload.phone
    if (payload.branch !== undefined) updateData.branch = payload.branch
    if (payload.department !== undefined) updateData.department = payload.department
    if (payload.position !== undefined) updateData.position = payload.position
    if (payload.isActive !== undefined) updateData.isActive = payload.isActive
    if (payload.avatar !== undefined) updateData.avatar = payload.avatar
    if (payload.roleName !== undefined) updateData.roleId = role._id
    if (payload.jshshir !== undefined) updateData.jshshir = payload.jshshir
    if (payload.password) updateData.passwordHash = await hashPassword(payload.password)

    // Clearing an optional identity field has to remove it from the document,
    // not write '' — a blank string is indexed by the partial unique index and
    // the next employee cleared the same way would collide with this one.
    const unsetData = {}
    for (const field of ['passportSeries', 'email']) {
      if (payload[field] === undefined) continue
      if (payload[field]) updateData[field] = payload[field]
      else unsetData[field] = ''
    }

    let updated
    try {
      updated = await userRepository.updateById(id, updateData, unsetData)
    } catch (error) {
      if (error.code === 11000) throw duplicateIdentityError(error)
      throw error
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      metadata: { fields: Object.keys(updateData) },
    })

    return toPublicUser(updated, role)
  },

  async deactivate(actor, id) {
    if (id === actor.id) {
      throw ApiError.badRequest('You cannot deactivate your own account', 'SELF_DEACTIVATION_FORBIDDEN')
    }

    const existing = await userRepository.findById(id)
    if (!existing) throw ApiError.notFound('User not found')
    const role = await roleRepository.findById(existing.roleId)
    await assertManagerCanManage(actor, role, existing.department)

    const updated = await userRepository.setActive(id, false)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'USER_DEACTIVATED',
      entity: 'User',
      entityId: id,
    })

    return toPublicUser(updated, role)
  },
}
