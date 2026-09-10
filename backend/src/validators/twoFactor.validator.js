import { z } from 'zod'

// Six digits for a TOTP code, or a recovery code (`A1B2-C3D4`). One field
// for both: the person types what they have, and telling them "that is a
// recovery code, use the other box" is a worse experience than accepting
// it.
const factorCode = z.string().trim().min(4).max(20)

export const twoFactorCodeSchema = z.object({
  code: factorCode,
})

export const twoFactorVerifySchema = z.object({
  token: z.string().min(20).max(200),
  code: factorCode,
})
