import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

/**
 * Answers arrive keyed by question id, with a payload whose shape depends
 * on the question's type — so it cannot be validated here without loading
 * the questions. It is not validated at all, on purpose: the grader treats
 * anything it does not understand as a wrong answer rather than an error
 * (questionGrading.js), which is the behaviour a submission from a browser
 * needs. Rejecting the whole submission over one malformed answer would
 * lose every other answer in it.
 */
export const submitTestSchema = z.object({
  sessionId: objectId,
  answers: z.record(z.string(), z.unknown()).optional().default({}),
})
