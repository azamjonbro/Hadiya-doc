import { videoService } from '../videos/video.service.js'
import { materialService } from '../materials/material.service.js'
import { assessmentService } from '../assessments/assessment.service.js'

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
}
