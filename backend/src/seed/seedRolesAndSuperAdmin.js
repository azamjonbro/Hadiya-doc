import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_SCOPES,
  ROLE_SCOPES,
} from '@lms/shared'
import { Role } from '../models/role.model.js'
import { Permission } from '../models/permission.model.js'
import { User } from '../models/user.model.js'
import { hashPassword } from '../utils/hash.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

async function seedPermissionCatalogue() {
  for (const key of ALL_PERMISSIONS) {
    const [module] = key.split(':')
    await Permission.updateOne({ key }, { $setOnInsert: { key, module, description: '' } }, { upsert: true })
  }
}

async function seedRoles() {
  const roleIdsByName = {}
  for (const name of Object.values(ROLES)) {
    const permissions = DEFAULT_ROLE_PERMISSIONS[name]
    // $addToSet rather than $setOnInsert: a role seeded by an older build
    // used to keep that build's permission list forever, so every
    // permission added afterwards — and every route gated on one — answered
    // 403 on existing installs until someone edited the collection by hand.
    // Union rather than overwrite, because the `roles` collection is the
    // runtime source of truth (see permissions.js): permissions an admin
    // granted a system role by hand must survive a restart.
    const role = await Role.findOneAndUpdate(
      { name },
      {
        $setOnInsert: { name, isSystem: true },
        $addToSet: { permissions: { $each: permissions } },
        // $set, not $setOnInsert: an install that predates 2.2 has roles with
        // no scope, and leaving them at the schema default would silence
        // every manager. The seeded roles' scopes are decided in code.
        $set: { scope: DEFAULT_ROLE_SCOPES[name] ?? ROLE_SCOPES.SELF },
      },
      { upsert: true, new: true }
    )
    roleIdsByName[name] = role._id
  }
  return roleIdsByName
}

async function seedSuperAdmin(superAdminRoleId) {
  const existing = await User.findOne({ roleId: superAdminRoleId })
  if (existing) return

  if (!env.SUPERADMIN_JSHSHIR) {
    throw new Error(
      'No SUPERADMIN exists yet and SUPERADMIN_JSHSHIR is not set. ' +
        'Add SUPERADMIN_JSHSHIR=<14 digits> to the backend .env and restart.'
    )
  }

  const passwordHash = await hashPassword(env.SUPERADMIN_PASSWORD)
  await User.create({
    // Surname first, so composeFullName() rebuilds exactly the fullName below
    // if this account is ever saved through the employee form.
    firstName: 'Admin',
    lastName: 'Super',
    fullName: 'Super Admin',
    jshshir: env.SUPERADMIN_JSHSHIR,
    email: env.SUPERADMIN_EMAIL.toLowerCase(),
    passwordHash,
    roleId: superAdminRoleId,
    isActive: true,
  })
  logger.info('SuperAdmin account seeded', { email: env.SUPERADMIN_EMAIL })
}

export async function seedRolesAndSuperAdmin() {
  await seedPermissionCatalogue()
  const roleIdsByName = await seedRoles()
  await seedSuperAdmin(roleIdsByName[ROLES.SUPERADMIN])
}
