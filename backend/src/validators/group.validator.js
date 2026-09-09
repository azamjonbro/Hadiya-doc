import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const nameList = z.array(z.string().trim().min(1).max(120)).max(50)

// The membership rule of a dynamic group (5.5). Same shape as an enrolment
// rule's match, read the same way: OR within a field, AND across.
const groupRuleSchema = z.object({
  roles: nameList.optional(),
  departments: nameList.optional(),
  branches: nameList.optional(),
  positions: nameList.optional(),
})

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(80),
  description: z.string().max(500).optional().default(''),
  department: z.string().max(80).optional().default(''),
  memberIds: z.array(objectId).optional().default([]),
  courseIds: z.array(objectId).optional().default([]),
  type: z.enum(['STATIC', 'DYNAMIC']).optional(),
  rule: groupRuleSchema.optional(),
})

export const updateGroupSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).optional(),
    department: z.string().max(80).optional(),
    type: z.enum(['STATIC', 'DYNAMIC']).optional(),
    rule: groupRuleSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const groupMembersSchema = z.object({
  userIds: z.array(objectId).min(1, 'Select at least one employee'),
})

export const groupCoursesSchema = z.object({
  courseIds: z.array(objectId).min(1, 'Select at least one course'),
})

export const listGroupsQuerySchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
})

export const leaderboardQuerySchema = z.object({
  groupId: objectId.optional(),
  department: z.string().optional(),
  period: z.enum(['all', 'week', 'month', 'quarter']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  // Employees see only people who have scored; managers turn this on to
  // spot the ones who haven't started.
  includeZero: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
})
