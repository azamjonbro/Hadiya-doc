import { PERMISSIONS } from '@lms/shared'
import { courseRepository } from '../../repositories/course.repository.js'
import { courseQuestionRepository } from '../../repositories/courseQuestion.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { canManageCourses } from '../courses/coursePermissions.js'

async function loadVisibleCourse(actor, courseId) {
  const course = await courseRepository.findById(courseId)
  if (!course) throw ApiError.notFound('Course not found')
  if (course.status !== 'PUBLISHED' && !canManageCourses(actor)) {
    throw ApiError.notFound('Course not found')
  }
  return course
}

function collectUserIds(question) {
  return [question.userId.toString(), ...question.answers.map((a) => a.userId.toString())]
}

function toPublicQuestion(question, usersById) {
  const author = usersById.get(question.userId.toString())
  return {
    id: question._id.toString(),
    courseId: question.courseId.toString(),
    userId: question.userId.toString(),
    fullName: author?.fullName ?? '',
    question: question.question,
    createdAt: question.createdAt,
    answers: question.answers.map((a) => ({
      id: a._id.toString(),
      userId: a.userId.toString(),
      fullName: usersById.get(a.userId.toString())?.fullName ?? '',
      answer: a.answer,
      createdAt: a.createdAt,
    })),
  }
}

async function hydrate(questions) {
  const userIds = [...new Set(questions.flatMap(collectUserIds))]
  const users = await userRepository.findByIds(userIds)
  const usersById = new Map(users.map((u) => [u._id.toString(), u]))
  return questions.map((q) => toPublicQuestion(q, usersById))
}

export const courseQuestionService = {
  async create(actor, courseId, payload) {
    await loadVisibleCourse(actor, courseId)
    const question = await courseQuestionRepository.create({ courseId, userId: actor.id, question: payload.question })
    const [hydrated] = await hydrate([question])
    return hydrated
  },

  async list(actor, courseId, query) {
    await loadVisibleCourse(actor, courseId)
    const rows = await courseQuestionRepository.listPage(courseId, query)
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return {
      items: await hydrate(items),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
    }
  },

  async answer(actor, courseId, questionId, payload) {
    await loadVisibleCourse(actor, courseId)
    const question = await courseQuestionRepository.findById(questionId)
    if (!question || question.courseId.toString() !== courseId) throw ApiError.notFound('Question not found')
    const updated = await courseQuestionRepository.addAnswer(questionId, { userId: actor.id, answer: payload.answer })
    const [hydrated] = await hydrate([updated])
    return hydrated
  },

  async remove(actor, courseId, questionId) {
    const question = await courseQuestionRepository.findById(questionId)
    if (!question || question.courseId.toString() !== courseId) throw ApiError.notFound('Question not found')
    const isOwn = question.userId.toString() === actor.id
    if (!isOwn && !actor.permissions?.includes(PERMISSIONS.COURSE_UPDATE)) {
      throw ApiError.forbidden('You cannot delete this question')
    }
    await courseQuestionRepository.deleteById(questionId)
  },
}
