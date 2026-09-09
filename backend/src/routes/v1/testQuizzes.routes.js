import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { testQuizController } from '../../controllers/testQuiz.controller.js'
import { submitTestSchema } from '../../validators/testQuiz.validator.js'

export const testQuizzesRouter = Router()

testQuizzesRouter.use(authenticate)

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

// Reported by the browser, counted by the server. The count only means
// anything because it is kept here — a visibilitychange handler is removed
// from the devtools console in a second.
testQuizzesRouter.post('/sessions/:sessionId/focus-loss', testQuizController.focusLoss)
