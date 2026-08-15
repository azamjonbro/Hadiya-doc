import { PERMISSIONS } from '@lms/shared'
import { newsRepository } from '../../repositories/news.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { roleRepository } from '../../repositories/role.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'

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

export const newsService = {
  async list(query) {
    const rows = await newsRepository.listPage(query)
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, -1) : rows
    return {
      items: items.map(toPublicNews),
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
    return {
      items: items.map(toPublicNews),
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
    return news
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
