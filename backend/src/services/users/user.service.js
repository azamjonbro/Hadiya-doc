import {
  ROLES,
  composeFullName,
  MANDATORY_NOTIFICATION_TYPES,
  isMandatoryNotificationType,
  resolveNotificationPrefs,
} from '@lms/shared'
import { userRepository } from '../../repositories/user.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { hashPassword } from '../../utils/hash.js'
import { ApiError } from '../../utils/ApiError.js'
import { courseAssignmentService } from '../courses/courseAssignment.service.js'
import { chatService } from '../chat/chat.service.js'
import { taskService } from '../tasks/task.service.js'
import { emitWebhookEvent } from '../integrations/webhook.service.js'
import { logger } from '../../config/logger.js'
import { queueUserEvaluation } from '../../jobs/enrollmentRuleQueue.js'
import { TEMPLATE_TYPES } from '../notifications/notificationTemplates.seed.js'
import { notificationService } from '../notifications/notification.service.js'
import { orgHierarchyService } from '../org/orgHierarchy.service.js'
import { hasUnscopedAccess } from '../access/actorScope.js'

const EMPLOYEE_TIER_ROLES = [ROLES.EMPLOYEE, ROLES.CALL_OPERATOR, ROLES.SELLER]

function toPublicUser(user, role) {
  return {
    id: user._id.toString(),
    // Both halves and the composed whole: forms edit the halves, every list
    // and header in the app renders fullName.
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    fullName: user.fullName,
    jshshir: user.jshshir,
    // Normalised to '' for the clients: the field is absent on documents where
    // it was never filled in, and a v-model bound to `undefined` warns.
    passportSeries: user.passportSeries ?? '',
    email: user.email ?? '',
    phone: user.phone,
    branch: user.branch ?? '',
    department: user.department,
    subdivision: user.subdivision ?? '',
    position: user.position,
    country: user.country ?? '',
    address: user.address ?? '',
    gender: user.gender ?? '',
    birthDate: user.birthDate ?? null,
    hireDate: user.hireDate ?? null,
    terminationDate: user.terminationDate ?? null,
    // Derived rather than stored: "archived" is exactly "has a leaving date",
    // and a second flag saying the same thing is a second thing to get wrong.
    isArchived: Boolean(user.terminationDate),
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

// A scoped actor may only create/update/deactivate EMPLOYEE-tier accounts
// within their own department — enforced here, not just hidden in the admin
// UI. Keyed on role.scope since 2.2, so a custom role is fenced too.
async function assertManagerCanManage(actor, role, department) {
  if (hasUnscopedAccess(actor)) return

  if (!EMPLOYEE_TIER_ROLES.includes(role.name)) {
    throw ApiError.forbidden('Managers can only manage employee-tier accounts', 'ROLE_SCOPE_FORBIDDEN')
  }
  const actorUser = await userRepository.findById(actor.id)
  if (department !== actorUser.department) {
    throw ApiError.forbidden('Managers can only manage users within their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
  }
}

// AT-18 asks for two things from a cross-department read: the 403, and a row
// in the audit log. The 403 alone leaves no trace of *who tried* — which is
// the half an incident review actually needs, because a refused read is not
// visible anywhere else. Recorded here rather than in the controller so every
// caller of getById (the profile, the three employee-insight reports) is
// covered by one write instead of four that can drift apart.
async function recordAccessDenied(actor, { entity, entityId, ...metadata }) {
  // Never let the audit write turn a 403 into a 500: the refusal is the
  // contract, the row is bookkeeping.
  try {
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ACCESS_DENIED',
      entity,
      entityId,
      metadata,
    })
  } catch (error) {
    logger.error({ err: error }, 'failed to record ACCESS_DENIED audit row')
  }
}

async function assertManagerCanView(actor, department, targetUserId = null) {
  if (hasUnscopedAccess(actor)) return
  const actorUser = await userRepository.findById(actor.id)
  if (department !== actorUser.department) {
    await recordAccessDenied(actor, {
      entity: 'User',
      entityId: targetUserId ? String(targetUserId) : null,
      reason: 'DEPARTMENT_SCOPE_FORBIDDEN',
      actorDepartment: actorUser.department ?? null,
      targetDepartment: department ?? null,
    })
    throw ApiError.forbidden('Managers can only view users within their own department', 'DEPARTMENT_SCOPE_FORBIDDEN')
  }
}


// Ids as the table sent them, split into the ones this actor may act on and
// the ones they may not, with a reason attached to every rejection. Both bulk
// operations start here so "you cannot touch this person" is decided once, in
// the same terms, whichever button was pressed.
async function partitionBulkTargets(actor, userIds, { requireActive = false } = {}) {
  const wanted = [...new Set(userIds.map(String))]
  const users = await userRepository.findByIds(wanted)
  const userById = new Map(users.map((user) => [user._id.toString(), user]))

  const roles = await roleRepository.findAll()
  const roleById = new Map(roles.map((role) => [role._id.toString(), role]))

  // A manager is fenced to their own department; loaded once rather than
  // per row, which is what assertManagerCanManage would have done.
  const actorDepartment = hasUnscopedAccess(actor) ? null : (await userRepository.findById(actor.id))?.department

  const eligible = []
  const failed = []
  const skipped = []

  for (const id of wanted) {
    const user = userById.get(id)
    if (!user) {
      failed.push({ id, code: 'NOT_FOUND', message: 'User not found' })
      continue
    }
    if (id === actor.id) {
      failed.push({ id, code: 'SELF_ACTION_FORBIDDEN', message: 'You cannot do this to your own account' })
      continue
    }

    const role = roleById.get(user.roleId.toString())
    if (!hasUnscopedAccess(actor)) {
      if (!role || !EMPLOYEE_TIER_ROLES.includes(role.name)) {
        failed.push({ id, code: 'ROLE_SCOPE_FORBIDDEN', message: 'Managers can only manage employee-tier accounts' })
        continue
      }
      if (user.department !== actorDepartment) {
        failed.push({
          id,
          code: 'DEPARTMENT_SCOPE_FORBIDDEN',
          message: 'Managers can only manage users within their own department',
        })
        continue
      }
    }

    // Not a failure — writing to (or switching off) somebody who is already
    // switched off is a no-op the admin should be told about, not an error
    // that makes the whole batch look broken.
    if (requireActive && !user.isActive) {
      skipped.push({ id, code: 'ACCOUNT_INACTIVE', fullName: user.fullName })
      continue
    }

    eligible.push(user)
  }

  return { requested: wanted.length, eligible, failed, skipped }
}

export const userService = {
  /**
   * The settings screen's view of notification preferences: every type the
   * platform can send, expanded from the sparse stored deviations, with the
   * mandatory ones flagged so the UI can lock them with an explanation
   * instead of letting someone flip a toggle and collect a 400.
   */
  async getNotificationPrefs(actor) {
    const user = await userRepository.findById(actor.id)
    if (!user) throw ApiError.notFound('User not found')
    return {
      locale: user.locale ?? 'uz',
      mandatoryTypes: MANDATORY_NOTIFICATION_TYPES,
      prefs: resolveNotificationPrefs(user.notificationPrefs ?? {}, TEMPLATE_TYPES),
    }
  },

  /**
   * Replaces the stored deviations.
   *
   * Two rules, both here rather than in the zod schema because they are
   * domain rules:
   *
   * - A mandatory type may not be switched off on any channel (§9.3). It
   *   answers 400 MANDATORY_NOTIFICATION, and nothing at all is saved — a
   *   partial save would leave the user believing the rest went through.
   * - `true` is pruned. Storage holds deviations from "everything on", so
   *   writing an explicit true is how a channel is turned back on, and
   *   keeping it would slowly rebuild the full matrix this design avoids.
   */
  async updateNotificationPrefs(actor, incoming) {
    for (const [type, channels] of Object.entries(incoming)) {
      if (!isMandatoryNotificationType(type)) continue
      const offChannel = Object.entries(channels).find(([, enabled]) => enabled === false)
      if (offChannel) {
        throw ApiError.badRequest(
          `${type} cannot be switched off — it is required for account access, security or compliance`,
          'MANDATORY_NOTIFICATION'
        )
      }
    }

    const stored = {}
    for (const [type, channels] of Object.entries(incoming)) {
      const off = Object.fromEntries(Object.entries(channels).filter(([, enabled]) => enabled === false))
      if (Object.keys(off).length) stored[type] = off
    }

    const user = await userRepository.updateById(actor.id, { notificationPrefs: stored })
    if (!user) throw ApiError.notFound('User not found')
    return {
      locale: user.locale ?? 'uz',
      mandatoryTypes: MANDATORY_NOTIFICATION_TYPES,
      prefs: resolveNotificationPrefs(stored, TEMPLATE_TYPES),
    }
  },

  /** The language this person is written to in — notifications and mail. */
  async updateLocale(actor, locale) {
    const user = await userRepository.updateById(actor.id, { locale })
    if (!user) throw ApiError.notFound('User not found')
    return { locale: user.locale }
  },

  async list(actor, query) {
    const roleFilter = query.role ? await roleRepository.findByName(query.role) : null
    let department = query.department

    if (!hasUnscopedAccess(actor)) {
      const actorUser = await userRepository.findById(actor.id)
      department = actorUser.department
    }

    const params = {
      search: query.search,
      roleId: roleFilter?._id,
      branch: query.branch,
      department,
      subdivision: query.subdivision,
      country: query.country,
      position: query.position,
      employment: query.status,
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
    if (!hasUnscopedAccess(actor)) {
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
    if (!hasUnscopedAccess(actor)) {
      const actorUser = await userRepository.findById(actor.id)
      return actorUser?.department ? userRepository.listPositions({ department: actorUser.department }) : []
    }
    return userRepository.listPositions()
  },

  async getById(actor, id) {
    const user = await userRepository.findById(id)
    if (!user) throw ApiError.notFound('User not found')
    await assertManagerCanView(actor, user.department, user._id)
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
        firstName: payload.firstName,
        lastName: payload.lastName,
        fullName: composeFullName(payload.firstName, payload.lastName),
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
        subdivision: payload.subdivision ?? '',
        employeeNumber: payload.employeeNumber || undefined,
        // No cycle check on create: a brand-new document has no reports, so
        // nothing can already be pointing at it.
        managerId: payload.managerId || null,
        position: payload.position ?? '',
        country: payload.country ?? '',
        address: payload.address ?? '',
        gender: payload.gender ?? '',
        birthDate: payload.birthDate ?? null,
        hireDate: payload.hireDate ?? null,
        terminationDate: payload.terminationDate ?? null,
        // Someone entered with a leaving date is someone being recorded after
        // the fact. The account follows the employment: archived means it
        // cannot sign in, so the two can never disagree.
        isActive: payload.terminationDate ? false : payload.isActive ?? true,
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

    // Enrolment rules (5.3). Queued rather than run here: it walks every
    // active rule, and nobody creating an employee should wait for that.
    // Without it a new hire spends their first day with an empty course
    // list until the nightly sweep.
    await queueUserEvaluation(user._id).catch((error) => {
      logger.warn('Could not queue the enrolment-rule evaluation', {
        userId: String(user._id),
        error: error.message,
      })
    })

    // Mandatory (§9.3): without it the employee has an account nobody told
    // them about. It carries the JSHSHIR to sign in with and never the
    // password — a password in an inbox outlives the person who leaves.
    try {
      await notificationService.notify({
        userId: user._id,
        type: 'ACCOUNT_CREATED',
        vars: { jshshir: user.jshshir },
      })
    } catch (error) {
      // Best-effort, like the assignments below: a mail relay being down
      // must not undo an account an admin has just created.
      logger.warn('Could not send the account-created notification', {
        userId: user._id.toString(),
        error: error.message,
      })
    }

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

    // Best-effort, same reasoning: a broadcast task this employee should
    // also carry must not roll back the account that was just created.
    try {
      await taskService.backfillForUser(user)
    } catch (error) {
      logger.warn('Failed to backfill broadcast tasks for new user', {
        userId: user._id.toString(),
        error: error.message,
      })
    }

    // Fire-and-forget by design (11.2): emitWebhookEvent never throws, and
    // an HR system's endpoint being down must not fail the account that was
    // just created.
    await emitWebhookEvent('user.created', { user })

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
    // The halves are what an admin edits; fullName is recomposed from whichever
    // of them the request carried, falling back to what is already stored, so a
    // request that changes only the surname still leaves a consistent whole.
    if (payload.firstName !== undefined) updateData.firstName = payload.firstName
    if (payload.lastName !== undefined) updateData.lastName = payload.lastName
    if (payload.firstName !== undefined || payload.lastName !== undefined) {
      updateData.fullName = composeFullName(
        payload.firstName ?? existing.firstName,
        payload.lastName ?? existing.lastName
      )
    }
    if (payload.phone !== undefined) updateData.phone = payload.phone
    if (payload.branch !== undefined) updateData.branch = payload.branch
    if (payload.department !== undefined) updateData.department = payload.department
    if (payload.subdivision !== undefined) updateData.subdivision = payload.subdivision
    if (payload.managerId !== undefined) {
      // Checked before the write, so the collection can simply never hold a
      // reporting loop. A cycle is one mistyped row in an HR export, and
      // every traversal after it either hangs or truncates silently.
      const managerId = payload.managerId || null
      await orgHierarchyService.assertNoCycle(id, managerId)
      updateData.managerId = managerId
    }
    if (payload.position !== undefined) updateData.position = payload.position
    if (payload.country !== undefined) updateData.country = payload.country
    if (payload.address !== undefined) updateData.address = payload.address
    if (payload.gender !== undefined) updateData.gender = payload.gender
    if (payload.birthDate !== undefined) updateData.birthDate = payload.birthDate
    if (payload.hireDate !== undefined) updateData.hireDate = payload.hireDate
    if (payload.terminationDate !== undefined) updateData.terminationDate = payload.terminationDate
    if (payload.isActive !== undefined) updateData.isActive = payload.isActive
    // Recording a leaving date archives the account in the same write, so an
    // admin cannot end up with someone who left still able to sign in. The
    // reverse is deliberately not automatic: clearing the date says the record
    // was wrong, and bringing an account back is its own decision, made with
    // the account switch.
    if (payload.terminationDate) updateData.isActive = false
    if (payload.avatar !== undefined) updateData.avatar = payload.avatar
    if (payload.roleName !== undefined) updateData.roleId = role._id
    if (payload.jshshir !== undefined) updateData.jshshir = payload.jshshir
    if (payload.password) updateData.passwordHash = await hashPassword(payload.password)

    // Clearing an optional identity field has to remove it from the document,
    // not write '' — a blank string is indexed by the partial unique index and
    // the next employee cleared the same way would collide with this one.
    const unsetData = {}
    for (const field of ['passportSeries', 'email', 'employeeNumber']) {
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

    // Moving someone changes what their old manager and their new one can
    // see, and the same for every manager above either — so both chains are
    // dropped, not just the one that exists now.
    if (payload.managerId !== undefined && String(existing.managerId ?? '') !== String(updateData.managerId ?? '')) {
      await orgHierarchyService.invalidateFor(id)
      if (existing.managerId) await orgHierarchyService.invalidateFor(existing.managerId)
    }

    await auditLogRepository.record({
      actor: actor.id,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      metadata: { fields: Object.keys(updateData) },
    })

    // Only when one of the four things a rule matches on actually moved.
    // Re-evaluating on every edit would queue a job for a phone-number
    // change, and the sweep already covers anything missed.
    const rulesMayApply = ['roleId', 'department', 'branch', 'position'].some((field) => field in updateData)
    if (rulesMayApply) {
      await queueUserEvaluation(id).catch((error) => {
        logger.warn('Could not queue the enrolment-rule evaluation', { userId: String(id), error: error.message })
      })
    }

    return toPublicUser(updated, role)
  },

  // ------------------------------------------------------------------
  // Bulk actions from the employees table
  // ------------------------------------------------------------------
  // One message written once, delivered as a separate private conversation to
  // each selected employee. The delivery itself belongs to chat, so this only
  // decides who is a legitimate recipient and hands the rest over.
  async bulkMessage(actor, { userIds, message }) {
    const { requested, eligible, failed, skipped } = await partitionBulkTargets(actor, userIds, {
      requireActive: true,
    })

    if (!eligible.length) {
      throw ApiError.badRequest('None of the selected employees can receive a message', 'NO_ELIGIBLE_RECIPIENTS', {
        count: requested,
      })
    }

    const { sent, failed: deliveryFailures } = await chatService.sendDirectBulk(
      actor,
      eligible.map((user) => user._id.toString()),
      message
    )

    await auditLogRepository.record({
      actor: actor.id,
      action: 'USERS_BULK_MESSAGED',
      entity: 'User',
      metadata: { requested, sent: sent.length, failed: failed.length + deliveryFailures.length },
    })

    return {
      requested,
      sent: sent.length,
      conversationIds: sent.map((row) => row.conversationId),
      skipped: skipped.map((row) => ({ id: row.id, code: row.code })),
      failed: [...failed, ...deliveryFailures.map((row) => ({ id: row.userId, code: row.code, message: row.message }))],
    }
  },

  // The employees table's "Faolsizlantirish" for a whole selection. Everyone
  // is checked before anything is written, then the survivors are switched
  // off in one update — so the operation cannot half-apply because the tenth
  // row turned out to be someone this actor may not touch.
  async bulkDeactivate(actor, userIds) {
    const { requested, eligible, failed, skipped } = await partitionBulkTargets(actor, userIds, {
      requireActive: true,
    })

    const ids = eligible.map((user) => user._id.toString())
    if (ids.length) await userRepository.setManyActive(ids, false)

    // One row per employee, with the same action name a single deactivation
    // writes — an audit trail queried by entityId must not care which button
    // switched the account off.
    for (const id of ids) {
      await auditLogRepository.record({
        actor: actor.id,
        action: 'USER_DEACTIVATED',
        entity: 'User',
        entityId: id,
        metadata: { bulk: true },
      })
    }

    return {
      requested,
      deactivated: ids.length,
      deactivatedIds: ids,
      skipped: skipped.map((row) => ({ id: row.id, code: row.code })),
      failed,
    }
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

    // The offboarding signal an integration actually wants: whoever holds
    // this person's other accounts learns about it without polling.
    await emitWebhookEvent('user.deactivated', { user: updated })

    return toPublicUser(updated, role)
  },
}
