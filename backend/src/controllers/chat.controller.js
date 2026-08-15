import { chatService } from '../services/chat/chat.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const chatController = {
  listConversations: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.listConversations(req.user))
  }),

  listContacts: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.listContacts(req.user, req.validatedQuery))
  }),

  openDirect: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.openDirect(req.user, req.body.userId), 'Conversation opened', 201)
  }),

  getConversation: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.getConversation(req.user, req.params.id))
  }),

  getConversationDetails: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.getConversationDetails(req.user, req.params.id))
  }),

  getMessages: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.getMessages(req.user, req.params.id, req.validatedQuery))
  }),

  sendMessage: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.sendMessage(req.user, req.params.id, req.body), 'Message sent', 201)
  }),

  markRead: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.markRead(req.user, req.params.id))
  }),

  editMessage: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.editMessage(req.user, req.params.messageId, req.body.body), 'Message updated')
  }),

  deleteMessage: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.deleteMessage(req.user, req.params.messageId), 'Message deleted')
  }),

  search: asyncHandler(async (req, res) => {
    const { q, conversationId } = req.validatedQuery
    sendSuccess(res, await chatService.searchMessages(req.user, { query: q, conversationId }))
  }),

  uploadAttachment: asyncHandler(async (req, res) => {
    sendSuccess(res, await chatService.uploadAttachment(req.user, req.body.kind, req.file), 'Attachment uploaded', 201)
  }),
}
