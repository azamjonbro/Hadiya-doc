import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '@lms/shared'

const identifier = z.string().min(1, 'JSHSHIR or email is required')

export const loginSchema = z.object({
  identifier,
  password: z.string().min(1, 'Password is required'),
  captchaToken: z.string().optional(),
})

export const passwordResetRequestSchema = z.object({
  identifier,
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  // Same floor as every other password in the system (see user.validator.js),
  // so a reset can't be rejected for a length an admin-generated password has.
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
})

// Own password, from the profile's security tab. The current one is required
// even though the caller is signed in: a session left open on a shared
// machine must not be enough to lock its owner out.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'The new password must differ from the current one',
    path: ['newPassword'],
  })
