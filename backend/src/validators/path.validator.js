import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

const itemSchema = z.object({
  type: z.enum(['COURSE', 'EVENT', 'ASSIGNMENT', 'PATH']).optional(),
  refId: objectId,
  order: z.coerce.number().int().min(0).max(1000).optional(),
  required: z.boolean().optional(),
  prerequisiteIds: z.array(objectId).max(20).optional(),
})

const sectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  order: z.coerce.number().int().min(0).max(1000).optional(),
  itemIds: z.array(objectId).max(200).optional(),
})

const shape = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  cover: z.string().trim().max(1000).optional(),
  kind: z.enum(['GENERAL', 'ONBOARDING', 'CERTIFICATION', 'DEVELOPMENT']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  sequential: z.boolean().optional(),
  items: z.array(itemSchema).max(200).optional(),
  sections: z.array(sectionSchema).max(50).optional(),
  targetRoles: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  branches: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  department: z.string().trim().max(120).optional(),
  certificateTemplateId: objectId.nullable().optional(),
  validityDays: z.coerce.number().int().min(0).max(3650).optional(),
}

export const createPathSchema = z.object(shape)

export const updatePathSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listPathsQuerySchema = z.object({
  kind: z.enum(['GENERAL', 'ONBOARDING', 'CERTIFICATION', 'DEVELOPMENT']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
})

export const assignPathSchema = z.object({
  userId: objectId,
  mandatory: z.boolean().optional(),
  deadline: z.coerce.date().nullable().optional(),
  groupId: objectId.nullable().optional(),
})
