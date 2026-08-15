import { z } from 'zod'

// One task can be handed to a single person, to everyone holding a given
// position, or to the whole company. `assigneeType` defaults to USER so the
// original single-assignee payload keeps working unchanged.
export const createTaskSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().default(''),
    assigneeType: z.enum(['USER', 'POSITION', 'ALL']).optional().default('USER'),
    assignedTo: z.string().optional(),
    position: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('MEDIUM'),
    deadline: z.coerce.date().nullable().optional(),
    attachments: z.array(z.string()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.assigneeType === 'USER' && !data.assignedTo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['assignedTo'], message: 'assignedTo is required' })
    }
    if (data.assigneeType === 'POSITION' && !data.position?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['position'], message: 'position is required' })
    }
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

const TASK_STATUS = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

// Batch edits come from dragging one card on the board, so status is the
// only field they carry — there is no UI for retitling a whole fan-out, and
// silently rewriting 200 documents' text from a drag would be a surprise.
//
// `fromStatus` scopes the change to the copies sitting in the column the
// card was dragged out of. Omitting it means the whole batch.
export const updateTaskBatchSchema = z.object({
  status: z.enum(TASK_STATUS),
  fromStatus: z.enum(TASK_STATUS).optional(),
})

export const batchScopeQuerySchema = z.object({
  fromStatus: z.enum(TASK_STATUS).optional(),
})

export const listTasksQuerySchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
