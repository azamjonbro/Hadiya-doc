import { DEFAULT_ROLE_PERMISSIONS, ROLES, ALL_PERMISSIONS } from '@lms/shared'
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
    const role = await Role.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, permissions, isSystem: true } },
      { upsert: true, new: true }
    )
    roleIdsByName[name] = role._id
  }
  return roleIdsByName
}

async function seedSuperAdmin(superAdminRoleId) {
  const existing = await User.findOne({ roleId: superAdminRoleId })
  if (existing) return

  const passwordHash = await hashPassword(env.SUPERADMIN_PASSWORD)
  await User.create({
    fullName: 'Super Admin',
    username: env.SUPERADMIN_USERNAME.toLowerCase(),
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
