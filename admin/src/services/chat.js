import { http } from './http'

export const chatApi = {
  listConversations() {
    return http.get('/chat/conversations').then((r) => r.data.data)
  },

  // The full colleague directory — everyone you could write to, whether or
  // not a thread exists yet.
  listContacts(params) {
    return http.get('/chat/contacts', { params }).then((r) => r.data.data)
  },

  openDirect(userId) {
    return http.post('/chat/conversations', { userId }).then((r) => r.data.data)
  },

  getConversation(conversationId) {
    return http.get(`/chat/conversations/${conversationId}`).then((r) => r.data.data)
  },

  getDetails(conversationId) {
    return http.get(`/chat/conversations/${conversationId}/details`).then((r) => r.data.data)
  },

  getMessages(conversationId, params) {
    return http.get(`/chat/conversations/${conversationId}/messages`, { params }).then((r) => r.data.data)
  },

  sendMessage(conversationId, payload) {
    return http.post(`/chat/conversations/${conversationId}/messages`, payload).then((r) => r.data.data)
  },

  markRead(conversationId) {
    return http.post(`/chat/conversations/${conversationId}/read`).then((r) => r.data.data)
  },

  editMessage(messageId, body) {
    return http.patch(`/chat/messages/${messageId}`, { body }).then((r) => r.data.data)
  },

  deleteMessage(messageId) {
    return http.delete(`/chat/messages/${messageId}`).then((r) => r.data.data)
  },

  search(params) {
    return http.get('/chat/search', { params }).then((r) => r.data.data)
  },

  // --- group threads (chat:group:manage) ---

  // Org groups ("Sotuv jamoasi") offered as a starting roster — served by
  // the chat API rather than /groups so this app needs no user:read.
  listSourceGroups() {
    return http.get('/chat/source-groups').then((r) => r.data.data)
  },

  createGroup(payload) {
    return http.post('/chat/groups', payload).then((r) => r.data.data)
  },

  renameGroup(conversationId, title) {
    return http.patch(`/chat/groups/${conversationId}`, { title }).then((r) => r.data.data)
  },

  addGroupMembers(conversationId, memberIds) {
    return http.post(`/chat/groups/${conversationId}/members`, { memberIds }).then((r) => r.data.data)
  },

  removeGroupMember(conversationId, userId) {
    return http.delete(`/chat/groups/${conversationId}/members/${userId}`).then((r) => r.data.data)
  },

  leaveGroup(conversationId) {
    return http.post(`/chat/groups/${conversationId}/leave`).then((r) => r.data.data)
  },

  // Two-step by design (see chat.routes.js): upload returns a storage key,
  // which the caller then references when sending the message. `onProgress`
  // drives the composer's upload bar.
  uploadAttachment({ file, kind, onProgress }) {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    return http
      .post('/chat/attachments', form, {
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) return
          onProgress(Math.round((event.loaded / event.total) * 100))
        },
      })
      .then((r) => r.data.data)
  },
}
