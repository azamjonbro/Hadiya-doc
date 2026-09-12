import { z } from 'zod'
import { ORG_LIST_TYPE_VALUES } from '@lms/shared'

export const orgListTypeParamSchema = z.object({
  type: z.enum(ORG_LIST_TYPE_VALUES),
})

export const orgListNameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  code: z.string().trim().max(40).optional(),
  headId: z.string().regex(/^[a-f\d]{24}$|^$/i).nullable().optional(),
})

export const orgListUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z.string().trim().max(40).optional(),
    headId: z.string().regex(/^[a-f\d]{24}$|^$/i).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
