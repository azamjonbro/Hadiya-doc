import { PERMISSIONS } from '@lms/shared'
import { quizRepository } from '../../repositories/quiz.repository.js'
import { quizAttemptRepository } from '../../repositories/quizAttempt.repository.js'
import { videoRepository } from '../../repositories/video.repository.js'
import { videoProgressRepository } from '../../repositories/videoProgress.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { pointsService } from '../gamification/points.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'

function canManage(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.VIDEO_MANAGE))
}

// isCorrect is only included for actors who can manage videos — the same
// endpoint serves both the admin quiz editor and the student quiz-taking
// view, so students never receive the answer key up front.
function toPublicQuiz(quiz, { includeAnswers }) {
  return {
    id: quiz._id.toString(),
    videoId: quiz.videoId.toString(),
    passScorePercent: quiz.passScorePercent,
    questions: quiz.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        id: q._id.toString(),
        text: q.text,
        order: q.order,
        options: q.options.map((o) => ({
          id: o._id.toString(),
          text: o.text,
          ...(includeAnswers ? { isCorrect: o.isCorrect } : {}),
        })),
      })),
  }
}

export const quizService = {
  async getForVideo(actor, videoId) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')
    const quiz = await quizRepository.findByVideoId(videoId)
    if (!quiz) return null
    return toPublicQuiz(quiz, { includeAnswers: canManage(actor) })
  },

  async upsert(actor, videoId, payload) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')

    for (const question of payload.questions) {
      const correctCount = question.options.filter((o) => o.isCorrect).length
      if (correctCount !== 1) {
        throw ApiError.badRequest(`"${question.text}" savolida faqat bitta to'g'ri javob bo'lishi kerak`)
      }
    }

    const existing = await quizRepository.findByVideoId(videoId)
    const quiz = await quizRepository.upsertForVideo(videoId, {
      courseId: video.courseId,
      passScorePercent: payload.passScorePercent ?? 70,
      questions: payload.questions,
      createdBy: existing ? existing.createdBy : actor.id,
      updatedBy: actor.id,
    })
    await videoRepository.updateById(videoId, { hasQuiz: true })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'VIDEO_QUIZ_UPSERTED',
      entity: 'Video',
      entityId: videoId,
    })
    return toPublicQuiz(quiz, { includeAnswers: true })
  },

  async remove(actor, videoId) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')
    await quizRepository.deleteByVideoId(videoId)
    await videoRepository.updateById(videoId, { hasQuiz: false })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'VIDEO_QUIZ_DELETED',
      entity: 'Video',
      entityId: videoId,
    })
  },

  async submit(actor, videoId, answers) {
    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')
    const quiz = await quizRepository.findByVideoId(videoId)
    if (!quiz) throw ApiError.notFound('Quiz not found')

    const progress = await videoProgressRepository.findByUserAndVideo(actor.id, videoId)
    if (!progress?.completedAt) {
      throw ApiError.badRequest('Testni topshirishdan oldin videoni to\'liq ko\'ring', 'VIDEO_NOT_COMPLETED')
    }

    const questionById = new Map(quiz.questions.map((q) => [q._id.toString(), q]))
    const correctOptionIndexByQuestion = {}
    for (const question of quiz.questions) {
      correctOptionIndexByQuestion[question._id.toString()] = question.options.findIndex((o) => o.isCorrect)
    }

    let correctCount = 0
    for (const answer of answers) {
      const question = questionById.get(answer.questionId)
      if (!question) continue
      if (correctOptionIndexByQuestion[answer.questionId] === answer.selectedOptionIndex) correctCount += 1
    }

    const scorePercent = quiz.questions.length ? Math.round((correctCount / quiz.questions.length) * 100) : 0
    const passed = scorePercent >= quiz.passScorePercent

    let pointsAwarded = 0
    if (passed && video.pointsEnabled) {
      const result = await pointsService.award(actor.id, videoId, video.courseId, video.points, 'QUIZ')
      if (result.awarded) pointsAwarded = result.points
    }

    await quizAttemptRepository.create({
      userId: actor.id,
      quizId: quiz._id,
      videoId,
      courseId: video.courseId,
      answers: answers.map((a) => ({ questionId: a.questionId, selectedOptionIndex: a.selectedOptionIndex })),
      scorePercent,
      passed,
      pointsAwarded,
    })

    // After the attempt is stored, so a notification can never claim a
    // result that was not recorded. Best-effort for the same reason as
    // everywhere else in this chain: the attempt is the fact, the message
    // about it is not.
    try {
      await notificationService.notify({
        userId: actor.id,
        type: passed ? 'QUIZ_PASSED' : 'QUIZ_FAILED',
        vars: {
          // A quiz has no title of its own — it belongs to a video, and
          // that is the name the learner recognises.
          quizTitle: video.title,
          score: `${scorePercent}%`,
          passingScore: `${quiz.passScorePercent}%`,
        },
        severity: passed ? 'INFO' : 'WARNING',
        relatedEntityType: 'Course',
        relatedEntityId: String(video.courseId),
      })
    } catch (error) {
      logger.warn('Could not send the quiz result notification', {
        userId: actor.id,
        quizId: String(quiz._id),
        error: error.message,
      })
    }

    return { scorePercent, passed, pointsAwarded, passScorePercent: quiz.passScorePercent, correctOptionIndexByQuestion }
  },

  // Admin/manager drill-down: for a given user's attempts at this video's
  // quiz, which question they got wrong and what the right answer was.
  async getAttemptsForUser(actor, videoId, targetUserId) {
    const isSelf = actor.id === targetUserId
    if (!isSelf && !actor.permissions?.includes(PERMISSIONS.ANALYTICS_VIEW_ALL)) {
      throw ApiError.forbidden('Missing required permission: analytics:view:all')
    }

    const video = await videoRepository.findById(videoId)
    if (!video) throw ApiError.notFound('Video not found')
    const quiz = await quizRepository.findByVideoId(videoId)
    if (!quiz) return { quiz: null, attempts: [] }

    const questionById = new Map(quiz.questions.map((q) => [q._id.toString(), q]))
    const attempts = await quizAttemptRepository.listByUserAndVideo(targetUserId, videoId)

    return {
      quiz: toPublicQuiz(quiz, { includeAnswers: true }),
      attempts: attempts.map((attempt) => ({
        id: attempt._id.toString(),
        scorePercent: attempt.scorePercent,
        passed: attempt.passed,
        pointsAwarded: attempt.pointsAwarded,
        createdAt: attempt.createdAt,
        answers: attempt.answers.map((a) => {
          const question = questionById.get(a.questionId.toString())
          const correctOption = question?.options.find((o) => o.isCorrect)
          const selectedOption = question?.options[a.selectedOptionIndex]
          return {
            questionId: a.questionId.toString(),
            questionText: question?.text ?? '',
            selectedOptionText: selectedOption?.text ?? '',
            correctOptionText: correctOption?.text ?? '',
            isCorrect: Boolean(selectedOption?.isCorrect),
          }
        }),
      })),
    }
  },
}
