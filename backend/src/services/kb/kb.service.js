import { KbArticle } from '../../models/kbArticle.model.js'
import { KbArticleVersion } from '../../models/kbArticleVersion.model.js'
import { KbCategory } from '../../models/kbCategory.model.js'
import { KbView } from '../../models/kbView.model.js'
import { KbComment } from '../../models/kbComment.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { isVisibleToActor } from '../access/visibility.js'
import { slugify } from '../../utils/slugify.js'
import { containsRegex } from '../../utils/escapeRegex.js'
import { ApiError } from '../../utils/ApiError.js'
import { PERMISSIONS } from '@lms/shared'
import { sanitizeArticleBody, toPlainText } from './kbSanitize.js'

function canManage(actor) {
  return Boolean(actor.permissions?.includes(PERMISSIONS.NEWS_MANAGE))
}

async function uniqueSlugFor(title) {
  const base = slugify(title)
  let slug = base
  let counter = 2
  while (await KbArticle.findOne({ slug })) {
    slug = `${base}-${counter}`
    counter += 1
  }
  return slug
}

function toListItem(article) {
  return {
    id: String(article._id),
    title: article.title,
    slug: article.slug,
    summary: article.summary ?? '',
    categoryId: article.categoryId ? String(article.categoryId) : null,
    tags: article.tags ?? [],
    status: article.status,
    viewCount: article.viewCount ?? 0,
    helpfulCount: article.helpfulCount ?? 0,
    notHelpfulCount: article.notHelpfulCount ?? 0,
    version: article.version ?? 1,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
  }
}

export const kbService = {
  async listCategories() {
    const categories = await KbCategory.find().sort({ order: 1, name: 1 }).lean()
    const counts = await KbArticle.aggregate([
      { $match: { deletedAt: null, status: 'PUBLISHED' } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ])
    const byCategory = new Map(counts.map((row) => [String(row._id), row.count]))
    return {
      items: categories.map((category) => ({
        id: String(category._id),
        name: category.name,
        slug: category.slug,
        description: category.description ?? '',
        icon: category.icon ?? '',
        parentId: category.parentId ? String(category.parentId) : null,
        order: category.order ?? 0,
        articleCount: byCategory.get(String(category._id)) ?? 0,
      })),
    }
  },

  async createCategory(actor, payload) {
    const category = await KbCategory.create({
      ...payload,
      slug: slugify(payload.name),
      createdBy: actor.id,
    })
    return { id: String(category._id), name: category.name }
  },

  /**
   * The article list, fenced by targeting.
   *
   * Staff see drafts; everybody else sees published articles they are
   * targeted by. The visibility check is per article rather than a query
   * clause because it may have to consult the user's branch — the same
   * trade-off the course catalog makes.
   */
  async list(actor, { categoryId, tag, search, limit = 50 } = {}) {
    const filter = { deletedAt: null }
    if (!canManage(actor)) filter.status = 'PUBLISHED'
    if (categoryId) filter.categoryId = categoryId
    if (tag) filter.tags = tag
    // Substring, not the text index: this box is typed into one letter at a
    // time, and `$text` matches whole words only.
    if (search) filter.$or = [{ title: containsRegex(search) }, { summary: containsRegex(search) }]

    const rows = await KbArticle.find(filter).sort({ updatedAt: -1 }).limit(limit).lean()

    const items = []
    for (const article of rows) {
      if (!canManage(actor) && !(await isVisibleToActor(actor, article))) continue
      items.push(toListItem(article))
    }
    return { items }
  },

  /**
   * One article, and a view row for having read it.
   *
   * The view is recorded here rather than by a separate "mark as read" call
   * because nobody presses that button — the useful question is "did the new
   * starters read the safety procedure", and it can only be answered if
   * opening it counts.
   */
  async getBySlug(actor, slug) {
    const article = await KbArticle.findOne({ slug, deletedAt: null }).lean()
    if (!article) throw ApiError.notFound('Article not found')

    if (!canManage(actor)) {
      if (article.status !== 'PUBLISHED') throw ApiError.notFound('Article not found')
      // AT-24's rule, one level down: an article somebody may not see must
      // not be distinguishable from one that does not exist.
      if (!(await isVisibleToActor(actor, article))) throw ApiError.notFound('Article not found')
    }

    const existing = await KbView.findOneAndUpdate(
      { articleId: article._id, userId: actor.id },
      { $set: { viewedAt: new Date() } },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    )
    // Counted only the first time: reopening it is the same person reading
    // it again, not a second reader.
    if (!existing) await KbArticle.updateOne({ _id: article._id }, { $inc: { viewCount: 1 } })

    const category = article.categoryId ? await KbCategory.findById(article.categoryId).lean() : null

    return {
      ...toListItem(article),
      // Already sanitised at write time; sanitising again on read would
      // hide a storage bug rather than fix it.
      body: article.body ?? '',
      categoryName: category?.name ?? '',
      myFeedback: existing?.helpful ?? null,
    }
  },

  async create(actor, payload) {
    const body = sanitizeArticleBody(payload.body ?? '')
    const article = await KbArticle.create({
      ...payload,
      body,
      bodyText: toPlainText(body),
      slug: await uniqueSlugFor(payload.title),
      publishedAt: payload.status === 'PUBLISHED' ? new Date() : null,
      createdBy: actor.id,
    })

    await this.snapshot(article, actor, 'Created')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'KB_ARTICLE_CREATED',
      entity: 'KbArticle',
      entityId: article._id.toString(),
      metadata: { title: article.title },
    })
    return toListItem(article.toObject())
  },

  /**
   * Updates it, and keeps what it said before.
   *
   * A knowledge base is read as instruction, so "what did this say in March,
   * when the incident happened" is a question somebody will ask.
   */
  async update(actor, id, payload) {
    const existing = await KbArticle.findOne({ _id: id, deletedAt: null })
    if (!existing) throw ApiError.notFound('Article not found')

    const fields = { ...payload, updatedBy: actor.id }
    const bodyChanged = payload.body !== undefined && payload.body !== existing.body
    if (payload.body !== undefined) {
      fields.body = sanitizeArticleBody(payload.body)
      fields.bodyText = toPlainText(fields.body)
    }
    if (payload.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      fields.publishedAt = new Date()
    }
    // The version tracks the *content*, not every edit: retagging an article
    // is not a new version of the procedure.
    if (bodyChanged || (payload.title && payload.title !== existing.title)) {
      fields.version = (existing.version ?? 1) + 1
    }

    const article = await KbArticle.findByIdAndUpdate(id, { $set: fields }, { new: true, runValidators: true })
    if (fields.version) await this.snapshot(article, actor, payload.changeNote ?? '')

    await auditLogRepository.record({
      actor: actor.id,
      action: 'KB_ARTICLE_UPDATED',
      entity: 'KbArticle',
      entityId: id,
      metadata: { fields: Object.keys(payload), version: article.version },
    })
    return toListItem(article.toObject())
  },

  /** Stores the article as it now stands. */
  async snapshot(article, actor, changeNote = '') {
    await KbArticleVersion.updateOne(
      { articleId: article._id, version: article.version ?? 1 },
      {
        $set: {
          title: article.title,
          summary: article.summary ?? '',
          body: article.body ?? '',
          changeNote,
          editedBy: actor.id,
        },
      },
      { upsert: true }
    )
  },

  async versions(articleId) {
    const rows = await KbArticleVersion.find({ articleId })
      .sort({ version: -1 })
      .populate('editedBy', 'fullName')
      .lean()
    return {
      items: rows.map((row) => ({
        version: row.version,
        title: row.title,
        changeNote: row.changeNote ?? '',
        editedBy: row.editedBy?.fullName ?? '',
        createdAt: row.createdAt,
      })),
    }
  },

  async remove(actor, id) {
    const article = await KbArticle.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    )
    if (!article) throw ApiError.notFound('Article not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'KB_ARTICLE_DELETED',
      entity: 'KbArticle',
      entityId: id,
      metadata: { title: article.title },
    })
    return { deleted: true }
  },

  // Rasn 18's trash: what was deleted, newest first, and the way back.
  async trash() {
    const rows = await KbArticle.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).lean()
    return { items: rows.map((article) => ({ ...toListItem(article), deletedAt: article.deletedAt })) }
  },

  async restore(actor, id) {
    const article = await KbArticle.findOneAndUpdate({ _id: id, deletedAt: { $ne: null } }, { $set: { deletedAt: null } }, { new: true })
    if (!article) throw ApiError.notFound('Article not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'KB_ARTICLE_RESTORED',
      entity: 'KbArticle',
      entityId: id,
      metadata: { title: article.title },
    })
    return toListItem(article)
  },

  /**
   * "Was this helpful?"
   *
   * Recorded on the view row, so one person's answer replaces their previous
   * one instead of stacking — an article somebody clicked twice is not
   * twice as helpful.
   */
  async rate(actor, articleId, helpful) {
    const view = await KbView.findOne({ articleId, userId: actor.id })
    const previous = view?.helpful ?? null
    if (previous === helpful) return { helpful }

    await KbView.updateOne(
      { articleId, userId: actor.id },
      { $set: { helpful, viewedAt: new Date() } },
      { upsert: true }
    )

    const inc = {}
    if (previous === true) inc.helpfulCount = -1
    if (previous === false) inc.notHelpfulCount = -1
    if (helpful === true) inc.helpfulCount = (inc.helpfulCount ?? 0) + 1
    if (helpful === false) inc.notHelpfulCount = (inc.notHelpfulCount ?? 0) + 1
    if (Object.keys(inc).length) await KbArticle.updateOne({ _id: articleId }, { $inc: inc })

    return { helpful }
  },

  async comments(articleId) {
    const rows = await KbComment.find({ articleId, deletedAt: null })
      .sort({ createdAt: 1 })
      .populate('userId', 'fullName avatar')
      .lean()
    return {
      items: rows.map((row) => ({
        id: String(row._id),
        body: row.body,
        parentId: row.parentId ? String(row.parentId) : null,
        userId: String(row.userId?._id ?? row.userId),
        fullName: row.userId?.fullName ?? '',
        resolvedAt: row.resolvedAt,
        createdAt: row.createdAt,
      })),
    }
  },

  async comment(actor, articleId, { body, parentId = null }) {
    const article = await KbArticle.findOne({ _id: articleId, deletedAt: null }).lean()
    if (!article) throw ApiError.notFound('Article not found')
    const row = await KbComment.create({ articleId, userId: actor.id, body, parentId })
    return { id: String(row._id), body: row.body, createdAt: row.createdAt }
  },

  async resolveComment(actor, commentId) {
    const comment = await KbComment.findByIdAndUpdate(
      commentId,
      { $set: { resolvedAt: new Date(), resolvedBy: actor.id } },
      { new: true }
    )
    if (!comment) throw ApiError.notFound('Comment not found')
    return { resolved: true }
  },

  /**
   * What nobody reads, and what people say is unhelpful.
   *
   * The reason the view rows exist: a knowledge base fails quietly — the
   * article that is out of date is the one nobody flags, and the one nobody
   * opens is the one that answers a question people do not have.
   */
  async analytics() {
    const articles = await KbArticle.find({ deletedAt: null, status: 'PUBLISHED' })
      .sort({ viewCount: 1 })
      .lean()

    // Rasn 19's table: every published article with its views, how many
    // distinct people opened it, and the share of positive votes — plus
    // the three figures over the table. One aggregate over the view rows,
    // one lookup for the authors and one for the spaces.
    const ids = articles.map((article) => article._id)
    const [viewers, authors, categories, audience] = await Promise.all([
      KbView.aggregate([{ $match: { articleId: { $in: ids } } }, { $group: { _id: '$articleId', users: { $sum: 1 } } }]),
      userRepository.findByIds([...new Set(articles.map((a) => String(a.createdBy)))]),
      KbCategory.find({ _id: { $in: [...new Set(articles.map((a) => a.categoryId).filter(Boolean))] } }).lean(),
      userRepository.countActive(),
    ])
    const usersById = new Map(viewers.map((row) => [String(row._id), row.users]))
    const authorById = new Map(authors.map((user) => [String(user._id), user.fullName]))
    const spaceById = new Map(categories.map((category) => [String(category._id), category.name]))
    const items = articles.map((article) => {
      const helpful = article.helpfulCount ?? 0
      const notHelpful = article.notHelpfulCount ?? 0
      return {
        ...toListItem(article),
        spaceName: article.categoryId ? (spaceById.get(String(article.categoryId)) ?? '') : '',
        authorName: authorById.get(String(article.createdBy)) ?? '',
        usersViewed: usersById.get(String(article._id)) ?? 0,
        helpfulPercent: helpful + notHelpful ? Math.round((helpful / (helpful + notHelpful)) * 100) : null,
      }
    })
    const votes = items.reduce((sum, item) => sum + item.helpfulCount + item.notHelpfulCount, 0)
    const positive = items.reduce((sum, item) => sum + item.helpfulCount, 0)

    return {
      items: items.sort((a, b) => b.viewCount - a.viewCount),
      totalViews: items.reduce((sum, item) => sum + item.viewCount, 0),
      audience,
      positivePercent: votes ? Math.round((positive / votes) * 100) : null,
      total: articles.length,
      unread: articles.filter((article) => (article.viewCount ?? 0) === 0).length,
      leastRead: articles.slice(0, 10).map(toListItem),
      // Flagged rather than left to arithmetic: more people saying it did
      // not help than did is a signal, not a statistic.
      unhelpful: articles
        .filter((article) => (article.notHelpfulCount ?? 0) > (article.helpfulCount ?? 0))
        .map(toListItem),
    }
  },
}
