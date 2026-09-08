import { Schema, model } from 'mongoose'
import { ROLE_SCOPE_VALUES, ROLE_SCOPES } from '@lms/shared'

const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    permissions: { type: [String], default: [] },

    // How far this role can see: ALL, DEPARTMENT, TEAM or SELF. Data on the
    // role rather than a hard-coded name, which is what makes a custom role
    // scopeable at all — before 2.2 the fence was `roleName === 'MANAGER'`,
    // so a new role with user:read could read the whole company (AT-21).
    //
    // Defaults to SELF, the narrowest option: a role created without saying
    // how far it reaches should reach as little as possible, and widening by
    // default is how this kind of change becomes a leak.
    scope: { type: String, enum: ROLE_SCOPE_VALUES, default: ROLE_SCOPES.SELF },

    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const Role = model('Role', roleSchema)
