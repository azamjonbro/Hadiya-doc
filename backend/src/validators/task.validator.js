import { z } from 'zod'

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  assignedTo: z.string().min(1, 'assignedTo is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('MEDIUM'),
  deadline: z.coerce.date().nullable().optional(),
  attachments: z.array(z.string()).optional().default([]),
})

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    deadline: z.coerce.date().nullable().optional(),
    attachments: z.array(z.string()).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listTasksQuerySchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
