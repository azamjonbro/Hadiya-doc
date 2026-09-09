import { Question } from '../../models/question.model.js'
import { QuestionBank } from '../../models/questionBank.model.js'
import { TestQuiz } from '../../models/testQuiz.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'

/** Banks and the questions in them. */
export const questionService = {
  async listBanks({ courseId } = {}) {
    const filter = {}
    // `courseId=null` is a real filter — the global banks — and distinct
    // from not filtering at all.
    if (courseId === 'global') filter.courseId = null
    else if (courseId) filter.courseId = courseId

    const banks = await QuestionBank.find(filter).sort({ name: 1 }).lean()
    const counts = await Question.aggregate([
      { $match: { bankId: { $in: banks.map((bank) => bank._id) } } },
      { $group: { _id: '$bankId', count: { $sum: 1 } } },
    ])
    const countByBank = new Map(counts.map((row) => [String(row._id), row.count]))

    return {
      items: banks.map((bank) => ({
        id: String(bank._id),
        name: bank.name,
        description: bank.description ?? '',
        courseId: bank.courseId ? String(bank.courseId) : null,
        tags: bank.tags ?? [],
        // Without this the pool editor cannot tell whether asking for ten
        // questions is reasonable.
        questionCount: countByBank.get(String(bank._id)) ?? 0,
      })),
    }
  },

  async createBank(actor, payload) {
    const bank = await QuestionBank.create({ ...payload, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'QUESTION_BANK_CREATED',
      entity: 'QuestionBank',
      entityId: bank._id.toString(),
      metadata: { name: bank.name },
    })
    return { id: String(bank._id), name: bank.name }
  },

  async updateBank(actor, id, payload) {
    const bank = await QuestionBank.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedBy: actor.id } },
      { new: true, runValidators: true }
    )
    if (!bank) throw ApiError.notFound('Bank not found')
    return { id: String(bank._id), name: bank.name }
  },

  /**
   * Deleting a bank is refused while a test still draws from it.
   *
   * A pool pointing at a bank that no longer exists is a test that quietly
   * produces fewer questions than it was configured with — the worst kind
   * of failure, because it looks like a working test.
   */
  async deleteBank(actor, id) {
    const questions = await Question.countDocuments({ bankId: id })
    const pools = await TestQuiz.countDocuments({ 'pools.bankId': id })
    if (pools > 0) {
      throw ApiError.badRequest(`${pools} test(s) still draw questions from this bank`, 'BANK_IN_USE')
    }
    if (questions > 0) {
      throw ApiError.badRequest(`This bank still holds ${questions} question(s)`, 'BANK_NOT_EMPTY')
    }
    const bank = await QuestionBank.findByIdAndDelete(id)
    if (!bank) throw ApiError.notFound('Bank not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'QUESTION_BANK_DELETED',
      entity: 'QuestionBank',
      entityId: String(id),
      metadata: { name: bank.name },
    })
    return { deleted: true }
  },

  async listQuestions(query) {
    const filter = {}
    if (query.bankId) filter.bankId = query.bankId
    if (query.type) filter.type = query.type
    if (query.tag) filter.tags = query.tag
    if (query.difficulty) filter.difficulty = query.difficulty
    // Substring rather than the text index, for the same reason the course
    // catalog does it: an author types this one letter at a time.
    if (query.search) filter.text = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    if (query.cursor) filter._id = { $lt: query.cursor }

    const rows = await Question.find(filter).sort({ _id: -1 }).limit(query.limit + 1).lean()
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return {
      items: items.map(toPublicQuestion),
      nextCursor: hasMore ? String(items.at(-1)._id) : null,
    }
  },

  async createQuestion(actor, payload) {
    const bank = await QuestionBank.findById(payload.bankId)
    if (!bank) throw ApiError.badRequest('That bank does not exist', 'BANK_NOT_FOUND')
    const question = await Question.create({ ...payload, createdBy: actor.id })
    return toPublicQuestion(question.toObject())
  },

  async updateQuestion(actor, id, payload) {
    const question = await Question.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedBy: actor.id } },
      { new: true, runValidators: true }
    )
    if (!question) throw ApiError.notFound('Question not found')
    return toPublicQuestion(question.toObject())
  },

  /**
   * Deleting a question a test names directly is refused.
   *
   * Pools are different — they draw whatever is there, so losing one
   * question makes the pool smaller and nothing breaks. A `questionIds`
   * entry pointing at nothing is a paper with a hole in it.
   */
  async deleteQuestion(actor, id) {
    const used = await TestQuiz.countDocuments({ questionIds: id })
    if (used > 0) {
      throw ApiError.badRequest(`${used} test(s) use this question directly`, 'QUESTION_IN_USE')
    }
    const question = await Question.findByIdAndDelete(id)
    if (!question) throw ApiError.notFound('Question not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'QUESTION_DELETED',
      entity: 'Question',
      entityId: String(id),
      metadata: { text: question.text.slice(0, 120) },
    })
    return { deleted: true }
  },
}

function toPublicQuestion(question) {
  return {
    id: String(question._id),
    bankId: String(question.bankId),
    type: question.type,
    text: question.text,
    explanation: question.explanation ?? '',
    points: question.points ?? 1,
    penalty: question.penalty ?? 0,
    tags: question.tags ?? [],
    difficulty: question.difficulty ?? 'MEDIUM',
    media: question.media ?? null,
    // The full payload, answers included. This endpoint is behind
    // quiz:configure — it is the authoring view. What a *learner* sees is
    // built by questionSelection.toLearnerPaper, which strips it.
    payload: question.payload ?? {},
    updatedAt: question.updatedAt,
  }
}
