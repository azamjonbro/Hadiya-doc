import { QuizAttempt } from '../models/quizAttempt.model.js'

export const quizAttemptRepository = {
  create(data) {
    return QuizAttempt.create(data)
  },

  listByUserAndVideo(userId, videoId) {
    return QuizAttempt.find({ userId, videoId }).sort({ createdAt: -1 })
  },

  listByUser(userId) {
    return QuizAttempt.find({ userId }).sort({ createdAt: -1 })
  },
}
