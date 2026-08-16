import { z } from 'zod'

export const listSnapshotsQuerySchema = z.object({
  videoId: z.string().optional(),
  userId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
