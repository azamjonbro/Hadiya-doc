import { z } from 'zod'

export const branchNameSchema = z.object({
  name: z.string().min(1, 'Branch name is required').max(60, 'Branch name is too long'),
})
