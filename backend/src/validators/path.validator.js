import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

const itemSchema = z.object({
  type: z.enum(['COURSE', 'EVENT', 'ASSIGNMENT', 'PATH']).optional(),
  refId: objectId,
  order: z.coerce.number().int().min(0).max(1000).optional(),
  required: z.boolean().optional(),
  prerequisiteIds: z.array(objectId).max(20).optional(),
  sectionId: objectId.nullable().optional(),
  startDay: z.coerce.number().int().min(0).max(3650).optional(),
  deadlineDays: z.coerce.number().int().min(0).max(3650).optional(),
})

const notificationsSchema = z.object({
  assign: z
    .object({
      enabled: z.boolean().optional(),
      subject: z.string().trim().max(200).optional(),
      text: z.string().trim().max(4000).optional(),
    })
    .optional(),
  beforeDeadline: z.object({ enabled: z.boolean().optional(), days: z.coerce.number().int().min(1).max(365).optional() }).optional(),
  afterDeadline: z
    .object({ enabled: z.boolean().optional(), days: z.array(z.coerce.number().int().min(1).max(365)).max(10).optional() })
    .optional(),
  completionToAdmins: z.boolean().optional(),
})

const sectionSchema = z.object({
  // Client-minted so that new items can point at a new stage in the same
  // save; the server keeps it as the subdocument's _id.
  id: objectId.optional(),
  title: z.string().trim().min(1).max(120),
  order: z.coerce.number().int().min(0).max(1000).optional(),
  itemIds: z.array(objectId).max(200).optional(),
})

const shape = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  cover: z.string().trim().max(1000).optional(),
  thumbnail: z.string().trim().max(1000).optional(),
  curatorId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  learningTimeMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  orderMode: z.enum(['SEQUENTIAL', 'BY_DAYS', 'FREE']).optional(),
  inCatalog: z.boolean().optional(),
  defaultDeadlineDays: z.coerce.number().int().min(0).max(3650).optional(),
  notifications: notificationsSchema.optional(),
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
