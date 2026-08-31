import { z } from 'zod'

// `null` is meaningful rather than invalid: it is how the caller says "stop
// setting this and inherit the default again". Same contract as
// attentionPolicy.validator.js.
export const facePolicySchema = z
  .object({
    verifyEveryOpen: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one policy field is required' })
