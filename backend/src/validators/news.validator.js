import { z } from 'zod'

export const createNewsSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  cover: z.string().optional().default(''),
  images: z.array(z.string()).optional().default([]),
  attachments: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  departmentTargets: z.array(z.string()).optional().default([]),
  roleTargets: z.array(z.string()).optional().default([]),
  publishAt: z.coerce.date().optional(),
  expiryAt: z.coerce.date().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
})

export const updateNewsSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    cover: z.string().optional(),
    images: z.array(z.string()).optional(),
    attachments: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    departmentTargets: z.array(z.string()).optional(),
    roleTargets: z.array(z.string()).optional(),
    publishAt: z.coerce.date().optional(),
    expiryAt: z.coerce.date().nullable().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listNewsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
