import { z } from 'zod'
import {
  GENDER_VALUES,
  NOTIFICATION_CHANNELS,
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

// Dates arrive from <input type="date"> as 'YYYY-MM-DD', or as '' when the
// admin left the field blank or cleared one. '' becomes null rather than being
// dropped, for the same reason the identity fields keep theirs: it is how an
// update says "this person has no leaving date after all".
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), { message: 'Must be a valid date' })
  .transform((value) => (value === '' ? null : new Date(value)))

const optionalGender = z.union([z.enum(GENDER_VALUES), z.literal('')])

const password = z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)

// Reporting line and HR key. `''` clears them, like the other optional
// identity fields — see the comment at the top of this file.
export const hierarchyFields = {
  managerId: z
    .string()
    .regex(/^[a-f\d]{24}$|^$/i, 'managerId must be a user id')
    .optional(),
  employeeNumber: z.string().trim().max(64).optional(),
}

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  jshshir,
  passportSeries: optionalPassportSeries.optional(),
  email: optionalEmail.optional(),
  phone: z.string().optional().default(''),
  roleName: z.string().min(1, 'Role is required'),
  branch: z.string().optional().default(''),
  department: z.string().optional().default(''),
  subdivision: z.string().optional().default(''),
  position: z.string().optional().default(''),
  country: z.string().optional().default(''),
  address: z.string().optional().default(''),
  gender: optionalGender.optional().default(''),
  birthDate: optionalDate.optional().default(''),
  hireDate: optionalDate.optional().default(''),
  terminationDate: optionalDate.optional().default(''),
  password,
  isActive: z.boolean().optional().default(true),
  courseIds: z.array(z.string().min(1)).optional().default([]),
  ...hierarchyFields,
})

export const updateUserSchema = z
  .object({
    ...hierarchyFields,
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    jshshir: jshshir.optional(),
    passportSeries: optionalPassportSeries.optional(),
    email: optionalEmail.optional(),
    phone: z.string().optional(),
    roleName: z.string().min(1).optional(),
    branch: z.string().optional(),
    department: z.string().optional(),
    subdivision: z.string().optional(),
    position: z.string().optional(),
    country: z.string().optional(),
    address: z.string().optional(),
    gender: optionalGender.optional(),
    birthDate: optionalDate.optional(),
    hireDate: optionalDate.optional(),
    terminationDate: optionalDate.optional(),
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
  subdivision: z.string().optional(),
  country: z.string().optional(),
  position: z.string().optional(),
  // 'working' and 'archived' answer "is this person still with us"; the older
  // 'active'/'inactive' pair answers "can this account sign in", and both are
  // kept because the employees page asks the first and the account column
  // shows the second.
  status: z.enum(['active', 'inactive', 'working', 'archived']).optional(),
  // `page` opts into numbered pagination (response carries total/totalPages);
  // `cursor` keeps the original "load more" behaviour. See user.service.js.
  page: z.coerce.number().int().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

// Bulk actions from the employees table. The 200 ceiling matches the chat
// group roster limit — the table pages at 15, so anything near this is a
// script rather than an admin ticking boxes.
const bulkUserIds = z.array(objectId).min(1, 'Select at least one employee').max(200)

export const bulkUserIdsSchema = z.object({
  userIds: bulkUserIds,
})

// `message` mirrors sendChatMessageSchema's body: same trim, same 4000 cap,
// because every id in the list ends up receiving exactly that message
// through the ordinary chat pipeline.
export const bulkMessageSchema = z.object({
  userIds: bulkUserIds,
  message: z.string().trim().min(1, 'Message cannot be empty').max(4000),
})

// PUT /users/me/notification-prefs.
//
// Only the channels someone has actually switched off are stored, so the
// body is a sparse map: { COURSE_ASSIGNED: { email: false } }. `true` is
// accepted too — that is how a channel is switched back on, by writing the
// value that is then pruned away as a non-deviation.
//
// Shape only. Which types may not be switched off is a domain rule, not a
// property of the request, and it is enforced in user.service.js so it can
// answer with its own error code (AT-16 expects MANDATORY_NOTIFICATION, not
// a generic VALIDATION_ERROR).
const notificationChannelPrefs = z
  .object(Object.fromEntries(NOTIFICATION_CHANNELS.map((channel) => [channel, z.boolean().optional()])))
  .strict()

export const notificationPrefsSchema = z.record(
  z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Notification type must be an UPPER_SNAKE_CASE key'),
  notificationChannelPrefs
)

export const updateLocaleSchema = z.object({
  locale: z.enum(['uz', 'ru', 'en']),
})
