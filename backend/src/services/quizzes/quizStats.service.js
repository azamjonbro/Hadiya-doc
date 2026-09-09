import { QuizAttempt } from '../../models/quizAttempt.model.js'
import { TestQuiz } from '../../models/testQuiz.model.js'
import { Question } from '../../models/question.model.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * Which questions people get wrong.
 *
 * The number an author actually needs is not the average score — it is the
 * per-question pass rate, because that is what separates "this cohort has
 * not learned the topic" from "this question is badly worded". A question
 * everybody fails is usually the second, and until now there was no way to
 * see either: attempts stored only a total.
 *
 * Computed from `perQuestion[]`, which is written at grading time. Not
 * recomputed from the questions as they stand now — an author who fixes a
 * wrong answer key must not retroactively rewrite how everybody did.
 */
export const quizStatsService = {
  async forQuiz(quizId) {
    const quiz = await TestQuiz.findById(quizId).lean()
    if (!quiz) throw ApiError.notFound('Test not found')

    const rows = await QuizAttempt.aggregate([
      { $match: { testQuizId: quiz._id } },
      { $unwind: '$perQuestion' },
      {
        $group: {
          _id: '$perQuestion.questionId',
          asked: { $sum: 1 },
          correct: { $sum: { $cond: ['$perQuestion.correct', 1, 0] } },
          awarded: { $sum: '$perQuestion.awarded' },
          max: { $sum: '$perQuestion.max' },
        },
      },
    ])

    const questions = await Question.find({ _id: { $in: rows.map((row) => row._id) } }).lean()
    const questionById = new Map(questions.map((question) => [String(question._id), question]))

    const items = rows
      .map((row) => {
        const question = questionById.get(String(row._id))
        const correctRate = row.asked ? Math.round((row.correct / row.asked) * 100) : 0
        return {
          questionId: String(row._id),
          text: question?.text ?? '(deleted question)',
          type: question?.type ?? '',
          // What the author set it at, next to what it turned out to be.
          // The two disagreeing is the useful signal.
          declaredDifficulty: question?.difficulty ?? '',
          asked: row.asked,
          correct: row.correct,
          correctRate,
          // The share of the marks earned, which differs from the pass rate
          // wherever partial credit is on.
          scoreRate: row.max ? Math.round((row.awarded / row.max) * 100) : 0,
          observedDifficulty: correctRate >= 80 ? 'EASY' : correctRate >= 45 ? 'MEDIUM' : 'HARD',
        }
      })
      // Hardest first: the reason anyone opens this page is to find the
      // question that is not working.
      .sort((a, b) => a.correctRate - b.correctRate)

    const attempts = await QuizAttempt.countDocuments({ testQuizId: quiz._id })
    const passed = await QuizAttempt.countDocuments({ testQuizId: quiz._id, passed: true })

    return {
      quizId: String(quiz._id),
      title: quiz.title,
      attempts,
      passRate: attempts ? Math.round((passed / attempts) * 100) : 0,
      // Flagged rather than left to the reader's arithmetic: a question
      // nearly everybody gets wrong is usually a wording problem, not a
      // knowledge one.
      suspicious: items.filter((item) => item.asked >= 5 && item.correctRate <= 20).map((item) => item.questionId),
      questions: items,
    }
  },
}
