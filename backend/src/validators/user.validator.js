import { z } from 'zod'

const usernamePattern = /^[a-z0-9._-]+$/i

export const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  username: z.string().min(3, 'Username must be at least 3 characters').regex(usernamePattern),
  email: z.string().email('Must be a valid email'),
  phone: z.string().optional().default(''),
  roleName: z.string().min(1, 'Role is required'),
  department: z.string().optional().default(''),
  position: z.string().optional().default(''),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  isActive: z.boolean().optional().default(true),
  courseIds: z.array(z.string().min(1)).optional().default([]),
})

export const updateUserSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    username: z.string().min(3).regex(usernamePattern).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    roleName: z.string().min(1).optional(),
    department: z.string().optional(),
    position: z.string().optional(),
    password: z.string().min(8).optional(),
    isActive: z.boolean().optional(),
    avatar: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

// Capped at a year so a hand-typed ?days= can't turn the employee activity
// view into an unbounded scan of a heavy sessions collection.
export const activityQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).optional().default(30),
})

export const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  // `page` opts into numbered pagination (response carries total/totalPages);
  // `cursor` keeps the original "load more" behaviour. See user.service.js.
  page: z.coerce.number().int().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
