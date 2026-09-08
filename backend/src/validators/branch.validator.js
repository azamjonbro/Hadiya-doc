import { z } from 'zod'

export const branchNameSchema = z.object({
  name: z.string().min(1, 'Branch name is required').max(60, 'Branch name is too long'),
})

// `?force=1` on a delete. Written out rather than z.coerce.boolean(), which
// would read the string "false" as true — the wrong way round for a flag that
// authorises clearing the branch off every employee holding it.
const forceFlag = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((value) => value === '1' || value === 'true')

export const branchDeleteQuerySchema = z.object({
  force: forceFlag,
})

// An undeclared branch has no id — the name on the employee and course
// records is its only handle, so deleting one addresses it by name.
export const branchDeleteByNameQuerySchema = z.object({
  name: z.string().min(1, 'Branch name is required').max(60, 'Branch name is too long'),
  force: forceFlag,
})
