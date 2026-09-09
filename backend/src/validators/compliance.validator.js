import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const nameList = z.array(z.string().trim().min(1).max(120)).max(50)

const shape = {
  name: z.string().trim().min(1).max(120),
  courseId: objectId,
  match: z
    .object({
      roles: nameList.optional(),
      departments: nameList.optional(),
      branches: nameList.optional(),
      positions: nameList.optional(),
    })
    .optional(),
  intervalMonths: z.coerce.number().int().min(1).max(120),
  dueDays: z.coerce.number().int().min(1).max(365).optional(),
  active: z.boolean().optional(),
}

export const createRecurringSchema = z.object(shape)

export const updateRecurringSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
