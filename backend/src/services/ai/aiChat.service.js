import { courseRepository } from '../../repositories/course.repository.js'
import { topicRepository } from '../../repositories/topic.repository.js'
import { videoRepository } from '../../repositories/video.repository.js'
import { courseAssignmentRepository } from '../../repositories/courseAssignment.repository.js'
import { aiChatMessageRepository } from '../../repositories/aiChatMessage.repository.js'
import { computeAccessFlags } from '../courses/courseAssignmentAccess.js'
import { getAnthropicClient, AI_CHAT_MODEL } from '../../ai/anthropicClient.js'
import { ApiError } from '../../utils/ApiError.js'
import { canManageCourses } from '../courses/coursePermissions.js'

// Last N turns (user+assistant) fed back to the model for conversational
// continuity — not the full history, to keep request size and cost bounded.
const HISTORY_CONTEXT_TURNS = 16

// Same authorization shape as videoAccessService.issueToken: admin/manager
// tiers (course:create) bypass, everyone else needs PUBLISHED material plus
// an accessible course assignment. This is the "AI faqat user access
// qilishi mumkin bo'lgan materiallar bilan ishlasin" requirement — the scope
// is re-derived from the database on every request, never trusted from the
// client beyond the ids used to look it up.
async function resolveScope(actor, { courseId, topicId, videoId }) {
  const canManage = canManageCourses(actor)

  const course = await courseRepository.findById(courseId)
  if (!course) throw ApiError.notFound('Course not found')
  if (course.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Course not found')

  let topic = null
  if (topicId) {
    topic = await topicRepository.findById(topicId)
    if (!topic || topic.courseId.toString() !== courseId) throw ApiError.notFound('Topic not found')
    if (topic.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Topic not found')
  }

  let video = null
  if (videoId) {
    video = await videoRepository.findById(videoId)
    if (!video || video.courseId.toString() !== courseId) throw ApiError.notFound('Video not found')
    if (topicId && video.topicId.toString() !== topicId) throw ApiError.notFound('Video not found')
    if (video.status !== 'PUBLISHED' && !canManage) throw ApiError.notFound('Video not found')
  }

  if (!canManage) {
    const assignment = await courseAssignmentRepository.findByUserAndCourse(actor.id, courseId)
    const accessible = assignment ? computeAccessFlags(assignment).accessible : false
    if (!accessible) {
      throw ApiError.forbidden('You do not have access to this course', 'COURSE_ACCESS_DENIED')
    }
  }

  return { course, topic, video }
}

function buildSystemPrompt({ course, topic, video }) {
  const lines = [
    "You are the AI study assistant embedded in a corporate LMS. Answer only using the course material described below — the titles and descriptions the platform gives you for this course/topic/video. You do not have the video's actual audio or visual content, only its title and description; if asked something that requires that (exact narration, on-screen details), say so plainly and answer from what's available instead.",
    '',
    `Course: ${course.title}`,
    course.description ? `Course description: ${course.description}` : null,
  ]
  if (topic) {
    lines.push(`Topic: ${topic.title}`)
    if (topic.description) lines.push(`Topic description: ${topic.description}`)
  }
  if (video) {
    lines.push(`Video: ${video.title}`)
    if (video.description) lines.push(`Video description: ${video.description}`)
  }
  lines.push(
    '',
    'When asked to summarize, list key points, or write a quiz, base it on the material above and be explicit that a quiz is generated from the description, not the full video. Keep answers focused and concise. Do not include internal or system XML tags in your response.'
  )
  return lines.filter(Boolean).join('\n')
}

function toPublicMessage(m) {
  return {
    id: m._id.toString(),
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  }
}

export const aiChatService = {
  async sendMessage(actor, { courseId, topicId, videoId, message }) {
    // Authorization is resolved before the configuration check, so an
    // unauthorized caller learns nothing about whether AI chat is even
    // configured, and so this path stays testable without a live API key.
    const scope = await resolveScope(actor, { courseId, topicId, videoId })

    const client = getAnthropicClient()
    if (!client) throw ApiError.internal('AI chat is not configured', 'AI_CHAT_UNAVAILABLE')

    const history = await aiChatMessageRepository.listRecentForContext({
      userId: actor.id,
      courseId,
      topicId,
      videoId,
      limit: HISTORY_CONTEXT_TURNS,
    })

    const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }]

    let reply
    try {
      // No tools are declared, so disabling thinking carries none of the
      // "tool call written as plain text" risk documented for Claude Opus 5
      // — worth it here for chat-latency, since this is short Q&A/summary/
      // quiz generation, not multi-step reasoning.
      const response = await client.messages.create({
        model: AI_CHAT_MODEL,
        max_tokens: 2048,
        thinking: { type: 'disabled' },
        system: buildSystemPrompt(scope),
        messages,
      })
      if (response.stop_reason === 'refusal') {
        reply = "I can't help with that request."
      } else {
        reply =
          response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n')
            .trim() || "I couldn't generate a response — please try rephrasing."
      }
    } catch {
      throw ApiError.internal('AI chat request failed, please try again', 'AI_CHAT_REQUEST_FAILED')
    }

    const [userMessage, assistantMessage] = await Promise.all([
      aiChatMessageRepository.create({ userId: actor.id, courseId, topicId, videoId, role: 'user', content: message }),
      aiChatMessageRepository.create({ userId: actor.id, courseId, topicId, videoId, role: 'assistant', content: reply }),
    ])

    return {
      userMessage: toPublicMessage(userMessage),
      assistantMessage: toPublicMessage(assistantMessage),
    }
  },

  async getHistory(actor, { courseId, topicId, videoId, cursor, limit }) {
    await resolveScope(actor, { courseId, topicId, videoId })
    const rows = await aiChatMessageRepository.listPage({ userId: actor.id, courseId, topicId, videoId, cursor, limit })
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return {
      items: items.map(toPublicMessage).reverse(),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
    }
  },
}
