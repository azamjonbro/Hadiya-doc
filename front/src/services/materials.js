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
}
