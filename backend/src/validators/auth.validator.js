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
