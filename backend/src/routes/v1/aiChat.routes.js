import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { aiChatRateLimiter } from '../../middlewares/aiChatRateLimit.middleware.js'
import { aiChatController } from '../../controllers/aiChat.controller.js'
import { sendAiChatMessageSchema, aiChatHistoryQuerySchema } from '../../validators/aiChat.validator.js'

export const aiChatRouter = Router()

aiChatRouter.use(authenticate, requirePermission(PERMISSIONS.AI_CHAT))

aiChatRouter.get('/history', validateQuery(aiChatHistoryQuerySchema), aiChatController.getHistory)
aiChatRouter.post('/messages', aiChatRateLimiter, validateBody(sendAiChatMessageSchema), aiChatController.sendMessage)
