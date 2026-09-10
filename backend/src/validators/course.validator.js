import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

// Catalog metadata (3.4). Shared between create and update so the two can
// never drift into accepting different shapes for the same field.
const courseMetadataShape = {
  categoryId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  authorIds: z.array(objectId).max(20).optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  prerequisiteCourseIds: z.array(objectId).max(20).optional(),
  certificateTemplateId: objectId.nullable().optional(),
  navigationMode: z.enum(['SEQUENTIAL', 'FREE']).optional(),
  validityDays: z.coerce.number().int().min(0).max(3650).optional(),
  version: z.coerce.number().int().min(1).max(1000).optional(),
  allowSelfEnroll: z.boolean().optional(),
  completionRule: z
    .object({
      minPercent: z.coerce.number().int().min(1).max(100).optional(),
      requireAllRequired: z.boolean().optional(),
    })
    .optional(),
}

export const createCourseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  cover: z.string().optional().default(''),
  banner: z.string().optional().default(''),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('DRAFT'),
  targetRoles: z.array(z.string()).optional().default([]),
  branches: z.array(z.string()).optional().default([]),
  department: z.string().optional().default(''),
  // One-time trigger, not a model field: when true and the course is being
  // published, matching active users get auto-assigned. See course.service.js.
  autoAssign: z.boolean().optional().default(false),
  ...courseMetadataShape,
})

export const updateCourseSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    cover: z.string().optional(),
    banner: z.string().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    targetRoles: z.array(z.string()).optional(),
    branches: z.array(z.string()).optional(),
    department: z.string().optional(),
    autoAssign: z.boolean().optional(),
    ...courseMetadataShape,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

// The only thing a duplicate needs from the caller, and it is optional:
// without it the copy takes the original's title with a suffix.
export const duplicateCourseSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
})

export const listCoursesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  // Admin-side facet only. Employees are scoped by their own branch already
  // (course.service.js), so this narrows the admin catalog rather than
  // widening anyone's access.
  branch: z.string().optional(),
  categoryId: objectId.optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  tag: z.string().trim().max(40).optional(),
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

export const courseCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Colour must be #rrggbb').optional(),
  parentId: objectId.nullable().optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
})

export const courseCategoryUpdateSchema = courseCategoryCreateSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

/**
 * The new order of a topic's contents (9.1).
 *
 * The whole list, in the order it should end up, rather than "move this one
 * to position 3". The caller is a screen showing every item; the order it
 * displays is the order it means, and a relative move has to be replayed
 * against a server state that may have changed underneath it.
 */
export const reorderContentSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
        contentType: z.enum([
          'VIDEO',
          'FILE',
          'PRESENTATION',
          'MULTIMEDIA',
          'MATERIAL',
          'ASSESSMENT',
          'LESSON',
          'SCORM',
        ]),
      })
    )
    .min(1)
    .max(500),
})
