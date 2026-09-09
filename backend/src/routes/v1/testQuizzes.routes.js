import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { testQuizController } from '../../controllers/testQuiz.controller.js'
import { PERMISSIONS } from '@lms/shared'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateQuery } from '../../middlewares/validate.middleware.js'
import { submitTestSchema } from '../../validators/testQuiz.validator.js'
import {
  createTestQuizSchema,
  updateTestQuizSchema,
  listTestQuizzesQuerySchema,
} from '../../validators/testQuizAdmin.validator.js'

export const testQuizzesRouter = Router()

testQuizzesRouter.use(authenticate)

// --- Authoring. These return the answer key, so they are all gated. ---
testQuizzesRouter.get(
  '/',
  requirePermission(PERMISSIONS.QUIZ_CONFIGURE),
  validateQuery(listTestQuizzesQuerySchema),
  testQuizController.list
)
testQuizzesRouter.post(
  '/',
  requirePermission(PERMISSIONS.QUIZ_CONFIGURE),
  validateBody(createTestQuizSchema),
  testQuizController.create
)
// Which questions people get wrong — the number that separates "this cohort
// has not learned it" from "this question is badly worded".
testQuizzesRouter.get('/:id/stats', requirePermission(PERMISSIONS.QUIZ_STATS_VIEW), testQuizController.stats)
testQuizzesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.QUIZ_CONFIGURE),
  validateBody(updateTestQuizSchema),
  testQuizController.update
)
testQuizzesRouter.delete('/:id', requirePermission(PERMISSIONS.QUIZ_CONFIGURE), testQuizController.remove)

// --- Sitting one. ---
// Sitting a test needs no permission beyond being signed in — it is the
// learner's own act. Who may *see* a given test is decided by the course it
// belongs to, and configuring one is quiz:configure on the authoring routes.
testQuizzesRouter.post('/:id/start', testQuizController.start)
testQuizzesRouter.post('/:id/submit', validateBody(submitTestSchema), testQuizController.submit)

// Where the learner stands on this test — every attempt, and which one
// counts under the test's scorePolicy.
testQuizzesRouter.get('/:id/summary', testQuizController.summary)
// One attempt, question by question. The answer key is included only when
// the test's revealMode allows it, or the caller can grade.
testQuizzesRouter.get('/attempts/:attemptId', testQuizController.review)
// Last of the GETs on '/:id', so 'summary', 'stats' and 'attempts' are
// matched by their own routes first.
testQuizzesRouter.get('/:id', requirePermission(PERMISSIONS.QUIZ_CONFIGURE), testQuizController.getById)

// Reported by the browser, counted by the server. The count only means
// anything because it is kept here — a visibilitychange handler is removed
// from the devtools console in a second.
testQuizzesRouter.post('/sessions/:sessionId/focus-loss', testQuizController.focusLoss)
