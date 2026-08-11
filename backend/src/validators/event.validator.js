import { z } from 'zod'

export const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  type: z.enum(['MEETING', 'TRAINING', 'SEMINAR', 'EVENT', 'ANNOUNCEMENT']),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  location: z.string().optional().default(''),
  participants: z.array(z.string()).optional().default([]),
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
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const calendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
