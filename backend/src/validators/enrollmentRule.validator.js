import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const nameList = z.array(z.string().trim().min(1).max(120)).max(50)

const shape = {
  name: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
  match: z
    .object({
      roles: nameList.optional(),
      departments: nameList.optional(),
      branches: nameList.optional(),
      positions: nameList.optional(),
      groups: z.array(objectId).max(50).optional(),
    })
    .optional(),
  grant: z
    .object({
      courseIds: z.array(objectId).max(100).optional(),
      pathIds: z.array(objectId).max(50).optional(),
      deadlineDays: z.coerce.number().int().min(0).max(3650).optional(),
      mandatory: z.boolean().optional(),
    })
    .optional(),
}

export const createEnrollmentRuleSchema = z.object(shape)

export const updateEnrollmentRuleSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
