import { z } from 'zod'

// The player's refresh loop hands back the token it already holds; a first
// request has no body at all, which is why every field is optional.
export const issueVideoTokenSchema = z
  .object({
    renewToken: z.string().min(1).optional(),
  })
  .strict()
