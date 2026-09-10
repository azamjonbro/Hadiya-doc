import { videoService } from '../videos/video.service.js'
import { materialService } from '../materials/material.service.js'
import { assessmentService } from '../assessments/assessment.service.js'
import { openTopic, reorderContent } from './contentItem.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'

// Fans out to each content type's own (already visibility-filtered)
// listing, tags every item with its contentType, and merges them into one
// admin-ordered sequence. Purely additive — GET /topics/:id/videos stays
// exactly as it was.
export const topicContentService = {
  async getContent(actor, topicId) {
    const [videos, materials, assessments] = await Promise.all([
      videoService.listByTopic(actor, topicId),
      materialService.listByTopic(actor, topicId),
      assessmentService.listSummariesByTopic(actor, topicId),
    ])

    const items = [
      ...videos.map((v) => ({ ...v, contentType: 'VIDEO' })),
      ...materials.map((m) => ({ ...m, contentType: m.type })),
      ...assessments.map((a) => ({ ...a, contentType: 'ASSESSMENT' })),
    ]

    return items.sort((a, b) => a.order - b.order)
  },

  /**
   * Rewrites the order of everything in one topic (9.1).
   *
   * There was no way to do this at all: every item took an `order` when it
   * was created and kept it, so a video added after a test could never be
   * moved in front of it. Worse, each collection numbered from its own last
   * item, so a topic with three videos and three files had two items at 0,
   * two at 1 and two at 2, and the merged curriculum came out in whatever
   * order the sort happened to settle on.
   *
   * Only an author may do it — the same permission that decides who sees a
   * draft in the first place.
   */
  async reorder(actor, topicId, items) {
    const { canManage } = await openTopic(actor, topicId)
    if (!canManage) throw ApiError.forbidden('Only course authors can reorder content')

    const result = await reorderContent(topicId, items)

    await auditLogRepository.record({
      actor: actor.id,
      action: 'TOPIC_CONTENT_REORDERED',
      entity: 'Topic',
      entityId: String(topicId),
      metadata: { items: items.length, reordered: result.reordered },
    })

    return result
  },
}
