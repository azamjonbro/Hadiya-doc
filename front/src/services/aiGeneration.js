import { http } from './http'

export const aiGenerationApi = {
  /**
   * Starts a course generation. Multipart when a document is attached,
   * because that is the only way to send one — the server reads the text
   * out of it and never stores the file.
   */
  courseOutline({ file, topic, lessonCount, lang }) {
    const formData = new FormData()
    if (file) formData.append('file', file)
    if (topic) formData.append('topic', topic)
    if (lessonCount) formData.append('lessonCount', String(lessonCount))
    if (lang) formData.append('lang', lang)
    return http.post('/ai/course-outline', formData).then((r) => r.data.data)
  },

  /**
   * Questions from a module's own lessons (the normal case), a topic or a
   * document. The result is a question bank to review.
   */
  quiz({ topicId, topic, count, lang, types, bankId, file }) {
    const formData = new FormData()
    if (file) formData.append('file', file)
    if (topicId) formData.append('topicId', topicId)
    if (topic) formData.append('topic', topic)
    if (count) formData.append('count', String(count))
    if (lang) formData.append('lang', lang)
    if (bankId) formData.append('bankId', bankId)
    ;(types ?? []).forEach((type) => formData.append('types', type))
    return http.post('/ai/quiz', formData).then((r) => r.data.data)
  },

  jobs() {
    return http.get('/ai/jobs').then((r) => r.data.data)
  },

  job(id) {
    return http.get(`/ai/jobs/${id}`).then((r) => r.data.data)
  },

  // What the month has cost. Readable by whoever can generate: the ceiling
  // is the reason a request may be refused.
  usage() {
    return http.get('/ai/usage').then((r) => r.data.data)
  },
}
