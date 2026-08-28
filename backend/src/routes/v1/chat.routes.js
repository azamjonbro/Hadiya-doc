import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { chatSendRateLimiter, chatUploadRateLimiter } from '../../middlewares/chatRateLimit.middleware.js'
import { chatController } from '../../controllers/chat.controller.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/ApiError.js'
import {
  chatContactsQuerySchema,
  chatGroupMembersSchema,
  chatMessagesQuerySchema,
  chatSearchQuerySchema,
  chatUploadKindSchema,
  createChatGroupSchema,
  editChatMessageSchema,
  openDirectSchema,
  renameChatGroupSchema,
  sendChatMessageSchema,
} from '../../validators/chat.validator.js'

export const chatRouter = Router()

chatRouter.use(authenticate)

// Direct messaging needs no permission of its own: any authenticated user
// may write to any other active user, and access to a *specific* thread is
// enforced by participation inside chat.service.js. (chat:support still
// exists — it gates the admin app's inbox route, not the API.)
chatRouter.get('/conversations', chatController.listConversations)
chatRouter.get('/contacts', validateQuery(chatContactsQuerySchema), chatController.listContacts)
chatRouter.get('/search', validateQuery(chatSearchQuerySchema), chatController.search)
chatRouter.post('/conversations', validateBody(openDirectSchema), chatController.openDirect)
chatRouter.get('/conversations/:id', chatController.getConversation)
chatRouter.get('/conversations/:id/details', chatController.getConversationDetails)
chatRouter.get('/conversations/:id/messages', validateQuery(chatMessagesQuerySchema), chatController.getMessages)
chatRouter.post(
  '/conversations/:id/messages',
  chatSendRateLimiter,
  validateBody(sendChatMessageSchema),
  chatController.sendMessage
)
chatRouter.post('/conversations/:id/read', chatController.markRead)

// Group threads. Unlike the routes above these are not open to everyone —
// creating a room and editing its roster is gated on chat:group:manage,
// checked inside chatService (which also enforces membership) rather than
// by requirePermission here, so the permission and the membership rule stay
// in one place and cannot disagree.
chatRouter.get('/source-groups', chatController.listSourceGroups)
chatRouter.post('/groups', validateBody(createChatGroupSchema), chatController.createGroup)
chatRouter.patch('/groups/:id', validateBody(renameChatGroupSchema), chatController.renameGroup)
chatRouter.post('/groups/:id/members', validateBody(chatGroupMembersSchema), chatController.addGroupMembers)
chatRouter.delete('/groups/:id/members/:userId', chatController.removeGroupMember)
chatRouter.post('/groups/:id/leave', chatController.leaveGroup)
chatRouter.patch('/messages/:messageId', validateBody(editChatMessageSchema), chatController.editMessage)
chatRouter.delete('/messages/:messageId', chatController.deleteMessage)

// Memory storage — the cap is small and the buffer is immediately
// re-validated by magic bytes and pushed to S3 in chatUpload.service.js,
// so there is no reason to touch local disk first (same as uploads.routes.js).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.CHAT_MAX_FILE_SIZE_MB * 1024 * 1024 },
})

function uploadSingleAttachment(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      next()
      return
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(
        ApiError.badRequest(
          `File must be ${env.CHAT_MAX_FILE_SIZE_MB}MB or smaller`,
          'FILE_TOO_LARGE',
          { limit: env.CHAT_MAX_FILE_SIZE_MB }
        )
      )
      return
    }
    next(ApiError.badRequest('Invalid upload', 'UPLOAD_ERROR'))
  })
}

// Two steps by design: upload, then send a message referencing the key.
// The upload alone can only ever put an object in a private bucket under
// the uploader's own prefix — it is not visible to anyone until a message
// that the sender is authorized to post points at it.
chatRouter.post(
  '/attachments',
  chatUploadRateLimiter,
  uploadSingleAttachment,
  validateBody(chatUploadKindSchema),
  chatController.uploadAttachment
)
