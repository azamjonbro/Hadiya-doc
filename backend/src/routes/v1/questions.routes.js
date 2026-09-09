import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { questionController } from '../../controllers/question.controller.js'
import {
  createQuestionSchema,
  updateQuestionSchema,
  questionBankCreateSchema,
  questionBankUpdateSchema,
  listQuestionsQuerySchema,
} from '../../validators/question.validator.js'

export const questionsRouter = Router()

// Authoring routes, all of them. These return questions *with* their answer
// keys, which is exactly why they sit behind quiz:configure and why the
// learner's paper is built by a different function entirely
// (questionSelection.toLearnerPaper).
questionsRouter.use(authenticate, requirePermission(PERMISSIONS.QUIZ_CONFIGURE))

// Before '/:id' — 'banks' is a literal segment, not a question id.
questionsRouter.get('/banks', questionController.listBanks)
questionsRouter.post('/banks', validateBody(questionBankCreateSchema), questionController.createBank)
questionsRouter.patch('/banks/:id', validateBody(questionBankUpdateSchema), questionController.updateBank)
questionsRouter.delete('/banks/:id', questionController.deleteBank)

questionsRouter.get('/', validateQuery(listQuestionsQuerySchema), questionController.list)
questionsRouter.post('/', validateBody(createQuestionSchema), questionController.create)
questionsRouter.patch('/:id', validateBody(updateQuestionSchema), questionController.update)
questionsRouter.delete('/:id', questionController.remove)
