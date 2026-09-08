import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  SYSTEM_ROLE_NAMES,
  ROLE_SCOPES,
  resolveRoleScope,
} from '@lms/shared'
import { Role } from '../../models/role.model.js'
import { User } from '../../models/user.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { Permission } from '../../models/permission.model.js'

// What a role created from the employee form is allowed to do. An admin adding
// "CASHIER" is naming a job, not granting authority, so a new role gets exactly
// what an ordinary employee has — see courses, do tasks, nothing more. Widening
// it is a deliberate act, not a side effect of typing a name.
const NEW_ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS[ROLES.EMPLOYEE]

export const roleService = {
  // Headcount rides along because the delete button needs to know: a role
  // somebody holds cannot be removed, and saying so before the click is
  // kinder than a 409 after it.
  async list() {
    const [roles, counts] = await Promise.all([
      Role.find().sort({ name: 1 }).lean(),
      User.aggregate([{ $group: { _id: '$roleId', users: { $sum: 1 } } }]),
    ])

    const usersByRoleId = new Map(counts.map((row) => [String(row._id), row.users]))
    return roles.map((role) => ({
      id: role._id.toString(),
      name: role.name,
      // resolveRoleScope, not role.scope: a document written before 2.2 has
      // no field, and the resolver reads that as narrowly as the name allows
      // rather than as ALL.
      scope: resolveRoleScope(role),
      permissions: role.permissions ?? [],
      isSystem: role.isSystem || SYSTEM_ROLE_NAMES.includes(role.name),
      users: usersByRoleId.get(role._id.toString()) ?? 0,
    }))
  },

  async create(actor, name, scope = ROLE_SCOPES.SELF) {
    // Role names are the uppercase keys the RBAC layer compares, so normalise
    // here rather than trusting the form to have done it.
    const normalized = name.trim().toUpperCase().replace(/\s+/g, '_')
    if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
      throw ApiError.badRequest(
        'A role name must start with a Latin letter and contain only letters, digits and underscores',
        'INVALID_ROLE_NAME'
      )
    }

    const existing = await Role.findOne({ name: normalized })
    if (existing) throw ApiError.conflict('A role with this name already exists', 'ROLE_EXISTS')

    const role = await Role.create({
      name: normalized,
      permissions: NEW_ROLE_PERMISSIONS,
      scope,
      isSystem: false,
    })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ROLE_CREATED',
      entity: 'Role',
      entityId: role._id.toString(),
      metadata: { name: normalized, scope },
    })

    return { id: role._id.toString(), name: role.name, scope: role.scope, isSystem: false, users: 0 }
  },

  /**
   * Changes what a role may do, without deleting it.
   *
   * Until now the only way to correct a role's permissions was to delete it
   * and make a new one — which the API refuses while anyone holds it, so in
   * practice a role's permissions were fixed for its lifetime.
   *
   * The seeded roles stay locked, the same six the delete path protects and
   * for the same reason: SUPERADMIN gates the admin panel and the others are
   * referenced by the seed. An admin who could untick `role:manage` on
   * SUPERADMIN would lock everyone out of role management permanently, with
   * no way back through the UI.
   */
  /**
   * The permission catalogue, grouped by module.
   *
   * Read from the `permissions` collection rather than from ALL_PERMISSIONS
   * directly: the collection carries the human description, and it is seeded
   * from that constant on every boot, so the two cannot drift.
   */
  async listPermissions() {
    const rows = await Permission.find().sort({ module: 1, key: 1 }).lean()
    const byModule = new Map()
    for (const row of rows) {
      if (!byModule.has(row.module)) byModule.set(row.module, [])
      byModule.get(row.module).push({ key: row.key, description: row.description ?? '' })
    }
    return [...byModule.entries()].map(([module, items]) => ({ module, permissions: items }))
  },

  async update(actor, id, { permissions, scope }) {
    const role = await Role.findById(id)
    if (!role) throw ApiError.notFound('Role not found')

    if (role.isSystem || SYSTEM_ROLE_NAMES.includes(role.name)) {
      throw ApiError.badRequest('Built-in roles cannot be edited', 'SYSTEM_ROLE_PROTECTED')
    }

    const before = { permissions: [...role.permissions], scope: resolveRoleScope(role) }
    if (permissions !== undefined) {
      // Deduplicated, because a grid can send the same key twice after a
      // double-click and a role holding a permission twice is confusing to
      // read back.
      role.permissions = [...new Set(permissions)]
    }
    if (scope !== undefined) role.scope = scope
    await role.save()

    await auditLogRepository.record({
      actor: actor.id,
      action: 'ROLE_UPDATED',
      entity: 'Role',
      entityId: role._id.toString(),
      // What changed, not just that something did: a permission grant is
      // exactly the kind of change someone will want to reconstruct later.
      metadata: {
        name: role.name,
        added: (permissions ?? []).filter((key) => !before.permissions.includes(key)),
        removed: before.permissions.filter((key) => !(permissions ?? before.permissions).includes(key)),
        scope: { from: before.scope, to: role.scope },
      },
    })

    const users = await User.countDocuments({ roleId: role._id })
    return {
      id: role._id.toString(),
      name: role.name,
      permissions: role.permissions,
      scope: role.scope,
      isSystem: false,
      users,
    }
  },

  async remove(actor, id) {
    const role = await Role.findById(id)
    if (!role) throw ApiError.notFound('Role not found')

    // The six seeded roles are wired into the code — SUPERADMIN gates the admin
    // panel, MANAGER scopes what a manager may touch — so they are not data an
    // admin can delete, whatever the isSystem flag on the row says.
    if (role.isSystem || SYSTEM_ROLE_NAMES.includes(role.name)) {
      throw ApiError.badRequest('Built-in roles cannot be deleted', 'SYSTEM_ROLE_PROTECTED')
    }

    const users = await User.countDocuments({ roleId: role._id })
    if (users > 0) {
      throw ApiError.conflict(
        `${users} employee${users === 1 ? '' : 's'} still hold this role — move them to another one first`,
        'ROLE_IN_USE',
        { count: users }
      )
    }

    await role.deleteOne()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ROLE_DELETED',
      entity: 'Role',
      entityId: id,
      metadata: { name: role.name },
    })

    return { id, name: role.name }
  },
}
