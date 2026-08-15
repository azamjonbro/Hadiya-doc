import { AssessmentAttempt } from '../models/assessmentAttempt.model.js'

export const assessmentAttemptRepository = {
  create(data) {
    return AssessmentAttempt.create(data)
  },

  listByUserAndAssessment(userId, assessmentId) {
    return AssessmentAttempt.find({ userId, assessmentId }).sort({ createdAt: -1 })
  },

  listByUser(userId) {
    return AssessmentAttempt.find({ userId }).sort({ createdAt: -1 })
  },
}
