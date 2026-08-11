import { http } from './http'

export const courseReviewsApi = {
  list(courseId, params) {
    return http.get(`/courses/${courseId}/reviews`, { params }).then((r) => r.data.data)
  },
  upsert(courseId, payload) {
    return http.put(`/courses/${courseId}/reviews`, payload).then((r) => r.data.data)
  },
  remove(courseId, reviewId) {
    return http.delete(`/courses/${courseId}/reviews/${reviewId}`).then((r) => r.data.data)
  },
}
