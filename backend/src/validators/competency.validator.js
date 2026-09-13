import { z } from 'zod'
import { COMPETENCY_SOURCES } from '../models/userCompetency.model.js'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

const levelSchema = z.object({
  value: z.coerce.number().int().min(1).max(10),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
})

/**
 * The ladder has to be 1, 2, 3 … with nothing missing and nothing repeated.
 *
 * Everything downstream is arithmetic on that number — `gap = required −
 * current`, "below the bar", the before/after comparison — and a scale of
 * 1, 2, 5 makes a gap of 3 mean either one rung or two depending on where
 * you start. Rejected at the door rather than normalised, because
 * renumbering somebody's saved scale would silently move every level
 * already recorded against it.
 */
const levelsSchema = z
  .array(levelSchema)
  .min(1, 'A competency needs at least one level')
  .max(10)
  .refine(
    (levels) => levels.every((level, index) => level.value === index + 1),
    { message: 'Levels must be consecutive integers starting at 1' }
  )

const requirementSchema = z.object({
  scope: z.enum(['POSITION', 'DEPARTMENT', 'BRANCH']),
  value: z.string().trim().min(1).max(120),
  level: z.coerce.number().int().min(1).max(10),
})

const shape = {
  // Uppercased here rather than in the service so the uniqueness check and
  // the stored value can never disagree about what "sls-01" is.
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, 'A code may only contain letters, digits, dot, dash and underscore')
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  levels: levelsSchema,
  requirements: z.array(requirementSchema).max(50).optional(),
  developmentCourseIds: z.array(objectId).max(50).optional(),
  validityDays: z.coerce.number().int().min(0).max(3650).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
}

export const createCompetencySchema = z
  .object(shape)
  .refine(
    // A requirement above the top of the ladder can never be met, so the
    // person it applies to is permanently in the red with no level to
    // reach. Caught here, where both halves are in the same payload.
    (data) => (data.requirements ?? []).every((requirement) => requirement.level <= data.levels.length),
    { message: 'A requirement cannot ask for a level the scale does not have', path: ['requirements'] }
  )

export const updateCompetencySchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
  .refine(
    // Only checkable when both arrive together; a requirement sent alone is
    // checked against the stored scale by the service.
    (data) => !data.levels || (data.requirements ?? []).every((req) => req.level <= data.levels.length),
    { message: 'A requirement cannot ask for a level the scale does not have', path: ['requirements'] }
  )

const profileShape = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  positions: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  items: z
    .array(z.object({ competencyId: objectId, level: z.coerce.number().int().min(1).max(10) }))
    .max(200)
    .optional(),
}
export const createProfileSchema = z.object(profileShape)
export const updateProfileSchema = z
  .object(Object.fromEntries(Object.entries(profileShape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

const folderShape = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  order: z.coerce.number().int().min(0).max(10000).optional(),
}
export const createFolderSchema = z.object(folderShape)
export const updateFolderSchema = z
  .object(Object.fromEntries(Object.entries(folderShape).map(([key, schema]) => [key, schema.optional()])))
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

export const assessSchema = z.object({
  userId: objectId,
  competencyId: objectId,
  // 0 is allowed and meaningful: "looked at, does not have it". Whether the
  // number is a rung on *this* competency's ladder is the service's call —
  // the validator does not have the competency in front of it.
  level: z.coerce.number().int().min(0).max(10),
  source: z.enum(COMPETENCY_SOURCES).optional(),
  note: z.string().trim().max(1000).optional(),
  evidence: z
    .object({
      type: z.enum(['NONE', 'COURSE', 'CERTIFICATE', 'QUIZ', 'OJT', 'REVIEW360']),
      refId: objectId.nullable().optional(),
    })
    .optional(),
})

const csvIds = z
  .string()
  .trim()
  .transform((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean))
  .pipe(z.array(objectId).max(50))

export const matrixQuerySchema = z.object({
  department: z.string().trim().max(120).optional(),
  position: z.string().trim().max(120).optional(),
  branch: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  competencyIds: csvIds.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // The matrix is people × competencies; a page of 200 people against 40
  // competencies is 8000 cells the browser has to lay out.
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const listCompetenciesQuerySchema = z.object({
  category: z.string().trim().max(80).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  q: z.string().trim().max(120).optional(),
})
