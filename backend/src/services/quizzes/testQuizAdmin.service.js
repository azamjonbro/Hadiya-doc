import { TestQuiz } from '../../models/testQuiz.model.js'
import { Question } from '../../models/question.model.js'
import { QuizAttempt } from '../../models/quizAttempt.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'

/** Authoring a unified test — separate from sitting one (testQuiz.service.js). */
export const testQuizAdminService = {
  async list({ scope, scopeId, courseId } = {}) {
    const filter = {}
    if (scope) filter.scope = scope
    if (scopeId) filter.scopeId = scopeId
    if (courseId) filter.courseId = courseId
    const items = await TestQuiz.find(filter).sort({ order: 1, createdAt: 1 }).lean()
    return { items: items.map(toPublicQuiz) }
  },

  async getById(id) {
    const quiz = await TestQuiz.findById(id).lean()
    if (!quiz) throw ApiError.notFound('Test not found')
    // The authoring view resolves the fixed questions, in the author's
    // order, so the editor does not have to make one request per question.
    const questions = await Question.find({ _id: { $in: quiz.questionIds ?? [] } }).lean()
    const byId = new Map(questions.map((question) => [String(question._id), question]))
    return {
      ...toPublicQuiz(quiz),
      questions: (quiz.questionIds ?? [])
        .map((questionId) => byId.get(String(questionId)))
        .filter(Boolean)
        .map((question) => ({
          id: String(question._id),
          type: question.type,
          text: question.text,
          points: question.points,
          difficulty: question.difficulty,
        })),
    }
  },

  async create(actor, payload) {
    const quiz = await TestQuiz.create({ ...payload, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'QUIZ_CREATED',
      entity: 'TestQuiz',
      entityId: quiz._id.toString(),
      metadata: { title: quiz.title, scope: quiz.scope },
    })
    return toPublicQuiz(quiz.toObject())
  },

  async update(actor, id, payload) {
    const quiz = await TestQuiz.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedBy: actor.id } },
      { new: true, runValidators: true }
    )
    if (!quiz) throw ApiError.notFound('Test not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'QUIZ_UPDATED',
      entity: 'TestQuiz',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublicQuiz(quiz.toObject())
  },

  /**
   * Deleting a test people have sat is refused.
   *
   * The attempts are somebody's record of having passed a mandatory course,
   * and a compliance report reads them. Dropping the test would leave those
   * rows pointing at nothing — the report would quietly stop counting
   * people who genuinely passed.
   */
  async remove(actor, id) {
    const attempts = await QuizAttempt.countDocuments({ testQuizId: id })
    if (attempts > 0) {
      throw ApiError.badRequest(
        `${attempts} attempt(s) have been made at this test — archive it instead of deleting it`,
        'QUIZ_HAS_ATTEMPTS'
      )
    }
    const quiz = await TestQuiz.findByIdAndDelete(id)
    if (!quiz) throw ApiError.notFound('Test not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'QUIZ_DELETED',
      entity: 'TestQuiz',
      entityId: String(id),
      metadata: { title: quiz.title },
    })
    return { deleted: true }
  },
}

function toPublicQuiz(quiz) {
  return {
    id: String(quiz._id),
    scope: quiz.scope,
    scopeId: String(quiz.scopeId),
    courseId: quiz.courseId ? String(quiz.courseId) : null,
    title: quiz.title,
    description: quiz.description ?? '',
    questionIds: (quiz.questionIds ?? []).map(String),
    pools: (quiz.pools ?? []).map((pool) => ({
      bankId: String(pool.bankId),
      count: pool.count,
      tags: pool.tags ?? [],
      difficulty: pool.difficulty ?? '',
    })),
    passScorePercent: quiz.passScorePercent,
    maxAttempts: quiz.maxAttempts,
    timeLimitMinutes: quiz.timeLimitMinutes,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleOptions: quiz.shuffleOptions,
    partialCredit: quiz.partialCredit,
    revealMode: quiz.revealMode,
    scorePolicy: quiz.scorePolicy,
    focusLossLimit: quiz.focusLossLimit,
    pointsEnabled: quiz.pointsEnabled,
    points: quiz.points,
    status: quiz.status,
    order: quiz.order,
    // How many questions a sitting will actually contain — fixed plus what
    // the pools promise. The editor shows it because "10 questions" is the
    // thing an author thinks they configured.
    questionCount: (quiz.questionIds ?? []).length + (quiz.pools ?? []).reduce((sum, pool) => sum + pool.count, 0),
    legacyKind: quiz.legacyKind ?? '',
    updatedAt: quiz.updatedAt,
  }
}
