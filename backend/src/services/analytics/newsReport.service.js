import { PERMISSIONS } from '@lms/shared'
import { newsRepository } from '../../repositories/news.repository.js'
import { newsViewRepository } from '../../repositories/newsView.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { ApiError } from '../../utils/ApiError.js'

function canViewAllAnalytics(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.ANALYTICS_VIEW_ALL))
}

export const newsReportService = {
  async getReport(actor, newsId, targetUserId) {
    const isSelf = actor.id === targetUserId
    if (!isSelf && !canViewAllAnalytics(actor)) {
      throw ApiError.forbidden('Missing required permission: analytics:view:all')
    }

    const [news, user, view] = await Promise.all([
      newsRepository.findById(newsId),
      userRepository.findById(targetUserId),
      newsViewRepository.findByUserAndNews(targetUserId, newsId),
    ])

    if (!news) throw ApiError.notFound('News not found')
    if (!user) throw ApiError.notFound('User not found')

    return {
      news: { id: news._id.toString(), title: news.title },
      user: { id: user._id.toString(), fullName: user.fullName },
      opened: Boolean(view),
      readPercent: view?.maxScrollDepth ?? 0,
      maxScrollDepth: view?.maxScrollDepth ?? 0,
      timeSpentSeconds: view?.timeSpentSeconds ?? 0,
      openCount: view?.openCount ?? 0,
      firstOpenedAt: view?.firstOpenedAt ?? null,
      lastOpenedAt: view?.lastOpenedAt ?? null,
      completed: Boolean(view?.completed),
    }
  },
}
