import { newsRepository } from '../repositories/news.repository.js'
import { newsViewRepository } from '../repositories/newsView.repository.js'
import { ApiError } from '../utils/ApiError.js'

const SCROLL_MILESTONES = [25, 50, 75, 90, 100]
const COMPLETION_THRESHOLD = 90

export async function processNewsEvents({ userId, newsId, events }) {
  const news = await newsRepository.findById(newsId)
  if (!news) throw ApiError.notFound('News not found')

  const existing = await newsViewRepository.findByUserAndNews(userId, newsId)
  const existingDepths = new Set((existing?.milestones ?? []).map((m) => m.depth))

  let openCountDelta = 0
  let firstOpenedAt = existing?.firstOpenedAt ?? null
  let lastOpenedAt = existing?.lastOpenedAt ?? null
  let timeSpentDelta = 0
  let maxScrollDepth = existing?.maxScrollDepth ?? 0
  const newMilestones = [...(existing?.milestones ?? [])]

  for (const event of events) {
    const at = new Date(event.timestamp)
    if (!firstOpenedAt || at < firstOpenedAt) firstOpenedAt = at
    if (!lastOpenedAt || at > lastOpenedAt) lastOpenedAt = at

    switch (event.eventType) {
      case 'opened':
        openCountDelta += 1
        break
      case 'scroll': {
        const depth = Math.min(100, Math.max(0, event.depth ?? 0))
        maxScrollDepth = Math.max(maxScrollDepth, depth)
        for (const milestone of SCROLL_MILESTONES) {
          if (depth >= milestone && !existingDepths.has(milestone)) {
            existingDepths.add(milestone)
            newMilestones.push({ depth: milestone, at })
          }
        }
        break
      }
      case 'timeSpent':
        timeSpentDelta += event.duration ?? 0
        break
      default:
        break
    }
  }

  const updated = await newsViewRepository.upsert(userId, newsId, {
    firstOpenedAt,
    lastOpenedAt,
    openCount: (existing?.openCount ?? 0) + openCountDelta,
    maxScrollDepth,
    milestones: newMilestones.sort((a, b) => a.depth - b.depth),
    timeSpentSeconds: (existing?.timeSpentSeconds ?? 0) + timeSpentDelta,
    completed: maxScrollDepth >= COMPLETION_THRESHOLD,
  })

  return { maxScrollDepth: updated.maxScrollDepth, completed: updated.completed }
}
