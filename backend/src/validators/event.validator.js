import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

// The 6.1 fields, shared by create and update so the two cannot drift into
// accepting different shapes for the same thing.
const eventExtras = {
  mode: z.enum(['OFFLINE', 'ONLINE', 'HYBRID']).optional(),
  meeting: z
    .object({
      provider: z.enum(['', 'ZOOM', 'MEET', 'TEAMS', 'OTHER']).optional(),
      url: z.string().trim().max(1000).optional(),
      meetingId: z.string().trim().max(120).optional(),
      passcode: z.string().trim().max(120).optional(),
    })
    .optional(),
  trainerIds: z.array(objectId).max(20).optional(),
  capacity: z.coerce.number().int().min(0).max(100000).optional(),
  requiresRegistration: z.boolean().optional(),
  // Sorted and de-duplicated on the way in: the reminder job dedups per
  // offset, and two identical offsets would be one reminder anyway — but
  // they would also make "which reminders are configured" unreadable.
  remindBeforeMinutes: z
    .array(z.coerce.number().int().min(1).max(20160))
    .max(5)
    .optional()
    .transform((values) => (values ? [...new Set(values)].sort((a, b) => b - a) : values)),
  linkedCourseId: objectId.nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']).optional(),
  cancelReason: z.string().trim().max(500).optional(),
}

export const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  type: z.enum(['MEETING', 'TRAINING', 'SEMINAR', 'EVENT', 'ANNOUNCEMENT']),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  location: z.string().optional().default(''),
  participants: z.array(z.string()).optional().default([]),
  ...eventExtras,
})

export const updateEventSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    type: z.enum(['MEETING', 'TRAINING', 'SEMINAR', 'EVENT', 'ANNOUNCEMENT']).optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    location: z.string().optional(),
    participants: z.array(z.string()).optional(),
    ...eventExtras,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const calendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export const markAttendanceSchema = z.object({
  entries: z
    .array(z.object({ userId: objectId, attended: z.boolean() }))
    .min(1, 'Mark at least one person')
    .max(500),
})

export const cancelRegistrationSchema = z.object({
  // Set only when an organiser removes somebody else; absent means the
  // caller is cancelling their own place.
  userId: objectId.optional(),
})
