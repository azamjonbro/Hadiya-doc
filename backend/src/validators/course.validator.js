import { z } from 'zod'

export const createCourseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  cover: z.string().optional().default(''),
  banner: z.string().optional().default(''),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('DRAFT'),
  targetRoles: z.array(z.string()).optional().default([]),
  department: z.string().optional().default(''),
  // One-time trigger, not a model field: when true and the course is being
  // published, matching active users get auto-assigned. See course.service.js.
  autoAssign: z.boolean().optional().default(false),
})

export const updateCourseSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    cover: z.string().optional(),
    banner: z.string().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    targetRoles: z.array(z.string()).optional(),
    department: z.string().optional(),
    autoAssign: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listCoursesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  // `page` opts into numbered pagination (response carries total/totalPages);
  // `cursor` keeps the original "load more" behaviour. Sending both is
  // meaningless, so page wins — see course.service.js.
  page: z.coerce.number().int().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const createTopicSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  cover: z.string().optional().default(''),
  banner: z.string().optional().default(''),
  order: z.coerce.number().int().optional().default(0),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
})

export const updateTopicSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    cover: z.string().optional(),
    banner: z.string().optional(),
    order: z.coerce.number().int().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const createAssignmentSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  mandatory: z.boolean().optional().default(true),
  startAt: z.coerce.date().optional(),
  deadline: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
})

export const updateAssignmentSchema = z
  .object({
    mandatory: z.boolean().optional(),
    startAt: z.coerce.date().nullable().optional(),
    deadline: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
