import { PERMISSIONS } from '@lms/shared'
import { newsRepository } from '../../repositories/news.repository.js'
import { newsViewRepository } from '../../repositories/newsView.repository.js'
import { newsEngagementRepository } from '../../repositories/newsEngagement.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'
import { notificationService } from '../notifications/notification.service.js'
import { logger } from '../../config/logger.js'

const NEWS_CACHE_TTL = 5 * 60
const newsCacheKey = (id) => `news:${id}`

function canManageNews(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.NEWS_CREATE))
}

function toPublicNews(news) {
  return {
    id: news._id.toString(),
    title: news.title,
    content: news.content,
    cover: news.cover,
    images: news.images,
    attachments: news.attachments,
    tags: news.tags,
    departmentTargets: news.departmentTargets,
    roleTargets: news.roleTargets,
    publishAt: news.publishAt,
    expiryAt: news.expiryAt,
    status: news.status,
    createdAt: news.createdAt,
    updatedAt: news.updatedAt,
  }
}

/**
 * Tells the article's audience about it, once.
 *
 * Fan-out is sequential and best-effort, the same shape group.service.js
 * uses for enrolments: one recipient failing must not stop the rest, and the
 * article is already published either way. It is genuinely a per-employee
 * loop — an announcement to everyone means a notification for everyone — so
 * the count is logged, which is the number to look at first if this ever
 * needs batching.
 */
async function announcePublished(actor, news) {
  const recipients = await userRepository.listActiveByNewsTargets({
    departments: news.departmentTargets ?? [],
    roleNames: news.roleTargets ?? [],
  })
  const author = await userRepository.findById(actor.id)

  let sent = 0
  for (const recipient of recipients) {
    // The author does not need telling about their own article.
    if (String(recipient._id) === String(actor.id)) continue
    try {
      await notificationService.notify({
        userId: recipient._id,
        type: 'NEWS_PUBLISHED',
        vars: { newsTitle: news.title, authorName: author?.fullName ?? '' },
        relatedEntityType: 'News',
        relatedEntityId: String(news._id),
      })
      sent += 1
    } catch (error) {
      logger.warn('Could not notify a recipient about published news', {
        newsId: String(news._id),
        userId: String(recipient._id),
        error: error.message,
      })
    }
  }
  logger.info('News published', { newsId: String(news._id), recipients: sent })
}

export const newsService = {
  async list(query) {
    const rows = await newsRepository.listPage(query)
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    // The admin table (rasn 24) shows readers, likes and comments per row;
    // the same three aggregates the feed pays for, without "liked by me".
    const ids = items.map((row) => row._id)
    const [views, engagement] = await Promise.all([
      newsViewRepository.countByNews(ids),
      newsEngagementRepository.summarize(ids, null),
    ])
    return {
      items: items.map((row) => ({
        ...toPublicNews(row),
        views: views[String(row._id)] ?? 0,
        likes: engagement[String(row._id)]?.likes ?? 0,
        comments: engagement[String(row._id)]?.comments ?? 0,
      })),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
    }
  },

  // Targeted feed: only published, within its publish/expiry window, and
  // matching the caller's department/role if the article targets any —
  // an untargeted article (empty target lists) is visible to everyone.
  async feed(actor, query) {
    const user = await userRepository.findById(actor.id)
    const role = await roleRepository.findById(actor.roleId)
    const rows = await newsRepository.feedPage({
      department: user.department,
      role: role.name,
      cursor: query.cursor,
      limit: query.limit,
    })
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    // Reader, like and comment counts ride along with the feed (portal §3
    // shows them under each item); a separate request per card would be
    // three per row.
    const ids = items.map((row) => row._id)
    const [views, engagement] = await Promise.all([
      newsViewRepository.countByNews(ids),
      newsEngagementRepository.summarize(ids, actor.id),
    ])
    return {
      items: items.map((row) => ({
        ...toPublicNews(row),
        views: views[String(row._id)] ?? 0,
        ...engagement[String(row._id)],
      })),
      nextCursor: hasMore ? items[items.length - 1]._id.toString() : null,
    }
  },

  async getById(actor, id) {
    let news = await cacheGet(newsCacheKey(id))
    if (!news) {
      const doc = await newsRepository.findById(id)
      if (!doc) throw ApiError.notFound('News not found')
      news = toPublicNews(doc)
      await cacheSet(newsCacheKey(id), news, NEWS_CACHE_TTL)
    }

    if (news.status !== 'PUBLISHED' && !canManageNews(actor)) {
      throw ApiError.notFound('News not found')
    }
    // Outside the cache: the counts change with every tap, and "liked by
    // me" is per reader while the article entry is shared.
    const [engagement, views] = await Promise.all([
      newsEngagementRepository.summarize([news.id], actor.id),
      newsViewRepository.countByNews([news.id]),
    ])
    return { ...news, views: views[news.id] ?? 0, ...engagement[news.id] }
  },

  // A published article only: liking or discussing a draft would leak
  // that it exists. `getById` already answers 404 for a draft to anyone
  // who cannot manage news.
  async toggleLike(actor, id) {
    await this.getById(actor, id)
    const liked = await newsEngagementRepository.toggleLike(id, actor.id)
    return { liked, likes: await newsEngagementRepository.countLikes(id) }
  },

  async comments(actor, id) {
    await this.getById(actor, id)
    const rows = await newsEngagementRepository.listComments(id)
    return {
      items: rows.map((row) => ({
        id: String(row._id),
        body: row.body,
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        avatar: row.userId?.avatar ?? '',
        createdAt: row.createdAt,
      })),
    }
  },

  async comment(actor, id, { body }) {
    await this.getById(actor, id)
    const row = await newsEngagementRepository.createComment({ newsId: id, userId: actor.id, body })
    const author = await userRepository.findById(actor.id)
    return {
      id: String(row._id),
      body: row.body,
      userId: String(actor.id),
      fullName: author?.fullName ?? '',
      avatar: author?.avatar ?? '',
      createdAt: row.createdAt,
    }
  },

  // The author takes back their own words; news:manage removes anyone's.
  async removeComment(actor, id, commentId) {
    const comment = await newsEngagementRepository.findComment(commentId)
    if (!comment || String(comment.newsId) !== String(id)) throw ApiError.notFound('Comment not found')
    const own = String(comment.userId) === String(actor.id)
    if (!own && !actor.permissions?.includes(PERMISSIONS.NEWS_MANAGE)) {
      throw ApiError.forbidden('Missing required permission: news:manage')
    }
    await newsEngagementRepository.softDeleteComment(commentId)
    if (!own) {
      await auditLogRepository.record({
        actor: actor.id,
        action: 'NEWS_COMMENT_REMOVED',
        entity: 'News',
        entityId: id,
        metadata: { commentId, authorId: String(comment.userId) },
      })
    }
  },

  async create(actor, payload) {
    const news = await newsRepository.create({ ...payload, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'NEWS_CREATED',
      entity: 'News',
      entityId: news._id.toString(),
      metadata: { title: news.title },
    })
    if (news.status === 'PUBLISHED') await announcePublished(actor, news)
    return toPublicNews(news)
  },

  async update(actor, id, payload) {
    const existing = await newsRepository.findById(id)
    if (!existing) throw ApiError.notFound('News not found')
    const updated = await newsRepository.updateById(id, { ...payload, updatedBy: actor.id })
    await cacheDel(newsCacheKey(id))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'NEWS_UPDATED',
      entity: 'News',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    // Only on the DRAFT -> PUBLISHED transition. Editing a typo in an
    // article that is already out must not announce it a second time.
    if (existing.status !== 'PUBLISHED' && updated.status === 'PUBLISHED') {
      await announcePublished(actor, updated)
    }
    return toPublicNews(updated)
  },

  async remove(actor, id) {
    const existing = await newsRepository.findById(id)
    if (!existing) throw ApiError.notFound('News not found')
    await cacheDel(newsCacheKey(id))
    // Trash, not a drop: the article leaves the feed and every listing, and
    // waits out the retention window on the trash page.
    await newsRepository.softDelete(id, actor.id)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'NEWS_TRASHED',
      entity: 'News',
      entityId: id,
      metadata: { title: existing.title },
    })
  },
}
