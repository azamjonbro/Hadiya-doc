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

// Reported by the browser, counted by the server. The count only means
// anything because it is kept here — a visibilitychange handler is removed
// from the devtools console in a second.
testQuizzesRouter.post('/sessions/:sessionId/focus-loss', testQuizController.focusLoss)
