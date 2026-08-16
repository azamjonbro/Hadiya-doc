import { z } from 'zod'
import {
  JSHSHIR_PATTERN,
  PASSPORT_SERIES_PATTERN,
  PASSWORD_MIN_LENGTH,
  normalizeJshshir,
  normalizePassportSeries,
} from '@lms/shared'

const jshshir = z
  .string()
  .transform(normalizeJshshir)
  .refine((value) => JSHSHIR_PATTERN.test(value), { message: 'JSHSHIR must be exactly 14 digits' })

// The optional identity fields arrive as '' from a form the admin left blank,
// and '' is kept all the way through parsing on purpose. It is the only way an
// update can say "clear this field" — mapping it to `undefined` here would make
// a deliberate clear indistinguishable from a field the request never mentioned,
// and user.service.js would silently drop it. Turning '' into an absent field on
// the document is that service's job (see the partial indexes in user.model.js).
const optionalPassportSeries = z
  .string()
  .transform(normalizePassportSeries)
  .refine((value) => value === '' || PASSPORT_SERIES_PATTERN.test(value), {
    message: 'Passport series must be two Latin letters followed by 7 digits, e.g. AA1234567',
  })

const optionalEmail = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => value === '' || z.string().email().safeParse(value).success, {
    message: 'Must be a valid email',
  })

const password = z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)

export const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  jshshir,
  passportSeries: optionalPassportSeries.optional(),
  email: optionalEmail.optional(),
  phone: z.string().optional().default(''),
  roleName: z.string().min(1, 'Role is required'),
  branch: z.string().optional().default(''),
  department: z.string().optional().default(''),
  position: z.string().optional().default(''),
  password,
  isActive: z.boolean().optional().default(true),
  courseIds: z.array(z.string().min(1)).optional().default([]),
})

export const updateUserSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    jshshir: jshshir.optional(),
    passportSeries: optionalPassportSeries.optional(),
    email: optionalEmail.optional(),
    phone: z.string().optional(),
    roleName: z.string().min(1).optional(),
    branch: z.string().optional(),
    department: z.string().optional(),
    position: z.string().optional(),
    password: password.optional(),
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
  branch: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  // `page` opts into numbered pagination (response carries total/totalPages);
  // `cursor` keeps the original "load more" behaviour. See user.service.js.
  page: z.coerce.number().int().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
