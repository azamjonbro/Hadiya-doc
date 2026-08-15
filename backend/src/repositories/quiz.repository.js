import { Quiz } from '../models/quiz.model.js'

export const quizRepository = {
  findByVideoId(videoId) {
    return Quiz.findOne({ videoId })
  },

  findByIds(ids) {
    return Quiz.find({ _id: { $in: ids } })
  },

  upsertForVideo(videoId, data) {
    return Quiz.findOneAndUpdate(
      { videoId },
      { $set: data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
  },

  deleteByVideoId(videoId) {
    return Quiz.findOneAndDelete({ videoId })
  },
}
