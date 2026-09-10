import { http } from './http'

export const lessonsApi = {
  // The topic listing carries block counts, not blocks — a curriculum is a
  // table of contents, and sending every block of every lesson would make
  // opening a course download the whole course.
  listByTopic(topicId) {
    return http.get(`/topics/${topicId}/lessons`).then((r) => r.data.data)
  },

  // Blocks arrive here, with VIDEO and FILE references already expanded into
  // titles and posters (the server does it in one query per collection).
  getById(id) {
    return http.get(`/lessons/${id}`).then((r) => r.data.data)
  },

  create(topicId, payload) {
    return http.post(`/topics/${topicId}/lessons`, payload).then((r) => r.data.data)
  },

  update(id, payload) {
    return http.patch(`/lessons/${id}`, payload).then((r) => r.data.data)
  },

  remove(id) {
    return http.delete(`/lessons/${id}`).then((r) => r.data.data)
  },

  progress(id) {
    return http.get(`/lessons/${id}/progress`).then((r) => r.data.data)
  },

  // A set of blocks per report rather than one id at a time: scrolling
  // through a page passes four blocks in a second.
  recordBlocks(id, blockIds) {
    return http.post(`/lessons/${id}/progress`, { blockIds }).then((r) => r.data.data)
  },

  // The reader declaring they are done, from the end of the lesson. The API
  // checks they actually got there.
  markComplete(id) {
    return http.post(`/lessons/${id}/progress/complete`).then((r) => r.data.data)
  },
}
