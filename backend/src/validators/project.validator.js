import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

// 255 is the reference's own limit (the counter under the name field).
export const projectNameSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(255, 'Project name is too long'),
})

// Optional on create: a project made from the sidebar's "+" is named by the
// server after its owner, the way the reference does, and renamed after.
export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
})

const access = z.enum(['VIEW', 'EDIT'])

export const addMembersSchema = z.object({
  userIds: z.array(objectId).min(1, 'Pick at least one person').max(200),
  access: access.optional().default('EDIT'),
})

export const memberAccessSchema = z.object({
  access,
})

export const candidatesQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})
