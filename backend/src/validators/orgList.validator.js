import { z } from 'zod'
import { ORG_LIST_TYPE_VALUES } from '@lms/shared'

export const orgListTypeParamSchema = z.object({
  type: z.enum(ORG_LIST_TYPE_VALUES),
})

export const orgListNameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
})
