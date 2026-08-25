import { z } from 'zod'

// The enroll/re-enroll/verify endpoints are multipart (photo uploads) and
// are validated by hand in faceVerification.service.js, same as
// proctor.routes.js does for its upload endpoint — Zod's body schema is
// used only where the body is plain JSON.
export const faceSetEnabledBodySchema = z.object({
  enabled: z.boolean(),
})
