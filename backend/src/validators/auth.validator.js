import { z } from 'zod'

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
  captchaToken: z.string().optional(),
})

export const passwordResetRequestSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})
