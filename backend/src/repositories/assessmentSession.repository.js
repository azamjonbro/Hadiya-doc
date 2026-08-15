import { AssessmentSession } from '../models/assessmentSession.model.js'

export const assessmentSessionRepository = {
  create(data) {
    return AssessmentSession.create(data)
  },

  findActive(userId, assessmentId) {
    return AssessmentSession.findOne({ userId, assessmentId, status: 'IN_PROGRESS' }).sort({ startedAt: -1 })
  },

  // Atomic so two tabs reporting a focus loss at the same moment cannot
  // both read "1" and both decide the limit has not been reached yet.
  incrementFocusLoss(id) {
    return AssessmentSession.findByIdAndUpdate(id, { $inc: { focusLossCount: 1 } }, { new: true })
  },

  close(id, { status, endedReason }) {
    return AssessmentSession.findByIdAndUpdate(
      id,
      { $set: { status, endedReason, endedAt: new Date() } },
      { new: true }
    )
  },

  listByUserAndAssessment(userId, assessmentId) {
    return AssessmentSession.find({ userId, assessmentId }).sort({ startedAt: -1 })
  },
}
