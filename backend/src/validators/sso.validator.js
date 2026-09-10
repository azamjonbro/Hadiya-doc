import { z } from 'zod'

// A relative path only. Anything absolute — or the protocol-relative
// `//evil.example` — would make this login an open redirect, which is
// exactly the trick that makes a phishing page look genuine.
const relativePath = z
  .string()
  .max(200)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/, 'A path beginning with a single /')

export const ssoStartSchema = z.object({
  redirect: relativePath.optional(),
})

export const ssoCallbackSchema = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(1).max(512).optional(),
  // The provider's own failure report, per OAuth 2 §4.1.2.1.
  error: z.string().max(200).optional(),
  error_description: z.string().max(500).optional(),
  // Providers append their own extras (`session_state`, `iss`); rejecting
  // the callback over one would break the login for a spec-compliant
  // provider.
}).passthrough()

export const ssoExchangeSchema = z.object({
  code: z.string().min(10).max(200),
})
