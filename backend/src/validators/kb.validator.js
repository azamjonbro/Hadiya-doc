import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const nameList = z.array(z.string().trim().min(1).max(120)).max(50)

const shape = {
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).optional(),
  // Not validated as HTML here. The shape of the markup is not the risk —
  // what it contains is, and that is decided by the allowlist in
  // kbSanitize.js at write time. Rejecting a tag here would only produce a
  // second, weaker copy of that rule.
  body: z.string().max(200000).optional(),
  categoryId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  targetRoles: nameList.optional(),
  branches: nameList.optional(),
  department: z.string().trim().max(120).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  changeNote: z.string().trim().max(500).optional(),
}

export const createArticleSchema = z.object(shape)

export const updateArticleSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const listArticlesQuerySchema = z.object({
  categoryId: objectId.optional(),
  tag: z.string().trim().max(40).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

export const createKbCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(60).optional(),
  parentId: objectId.nullable().optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
})

export const rateArticleSchema = z.object({ helpful: z.boolean() })

export const kbCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentId: objectId.nullable().optional(),
})
