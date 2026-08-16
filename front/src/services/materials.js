import { http } from './http'

export const materialsApi = {
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/materials`).then((r) => r.data.data)
  },

  // `inline` for the formats the browser renders on its own (PDF, audio),
  // `attachment` for the download button.
  getUrl(id, disposition = 'attachment') {
    return http.get(`/materials/${id}/download-url`, { params: { disposition } }).then((r) => r.data.data)
  },

  // Raw bytes, proxied through the API so the in-browser parsers (docx, xlsx,
  // pptx) work without CORS rules on the storage bucket.
  getContent(id) {
    return http.get(`/materials/${id}/content`, { responseType: 'arraybuffer' }).then((r) => r.data)
  },

  create(topicId, { type, title, description, order, file }, onUploadProgress) {
    const formData = new FormData()
    formData.append('type', type)
    formData.append('title', title)
    if (description) formData.append('description', description)
    if (order !== undefined) formData.append('order', String(order))
    formData.append('file', file)
    return http
      .post(`/topics/${topicId}/materials`, formData, { onUploadProgress })
      .then((r) => r.data.data)
  },
  update(id, payload) {
    return http.patch(`/materials/${id}`, payload).then((r) => r.data.data)
  },
  remove(id) {
    return http.delete(`/materials/${id}`).then((r) => r.data.data)
  },
  getDownloadUrl(id) {
    return http.get(`/materials/${id}/download-url`).then((r) => r.data.data)
  },
}
