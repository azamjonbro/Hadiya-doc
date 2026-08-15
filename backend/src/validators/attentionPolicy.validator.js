import { z } from 'zod'

// Every field is optional, and `null` is meaningful rather than invalid: it
// is how a course override says "stop overriding this one, inherit again".
// The ranges mirror the mongoose schema so a bad value is refused at the edge
// with a readable message instead of surfacing as a cast error.
const nullable = (schema) => schema.nullable().optional()

export const attentionPolicySchema = z
  .object({
    enabled: nullable(z.boolean()),
    graceSeconds: nullable(z.number().int().min(1).max(60)),
    pauseOnWarning: nullable(z.boolean()),
    lockoutAfterWarnings: nullable(z.number().int().min(0).max(50)),
    lockoutSeconds: nullable(z.number().int().min(5).max(300)),
    requireRewatch: nullable(z.boolean()),
    notifyManagerAfter: nullable(z.number().int().min(0).max(100)),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one policy field is required' })
