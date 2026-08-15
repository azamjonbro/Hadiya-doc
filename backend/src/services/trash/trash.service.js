import { courseRepository } from '../../repositories/course.repository.js'
import { newsRepository } from '../../repositories/news.repository.js'
import { userRepository } from '../../repositories/user.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { courseService } from '../courses/course.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { logger } from '../../config/logger.js'

// How long a deleted thing is recoverable. After this it is destroyed on the
// next visit to the trash page — see purgeExpired() for why the sweep is lazy
// rather than a scheduled job.
export const TRASH_RETENTION_DAYS = 30

const RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

// One entry per soft-deletable type. Adding a type here is all it takes for
// it to appear on the trash page, be restorable and be swept: the page reads
// this registry rather than knowing about courses or articles.
const TYPES = {
  COURSE: {
    listTrashed: () => courseRepository.listTrashed(),
    restore: (actor, id) => courseService.restore(actor, id),
    // Deleting a course is a cascade (topics, videos, analytics), so the
    // sweep goes through the service rather than dropping one row.
    destroy: (actor, id) => courseService.destroy(actor, id),
    listExpired: (before) => courseRepository.listExpired(before),
    label: (row) => row.title,
  },
  NEWS: {
    listTrashed: () => newsRepository.listTrashed(),
    restore: async (actor, id) => {
      const existing = await newsRepository.findAnyById(id)
      if (!existing) throw ApiError.notFound('News not found')
      if (!existing.deletedAt) throw ApiError.badRequest('Article is not in the trash', 'NOT_TRASHED')
      const restored = await newsRepository.restore(id)
      await auditLogRepository.record({
        actor: actor.id,
        action: 'NEWS_RESTORED',
        entity: 'News',
        entityId: id,
        metadata: { title: existing.title },
      })
      return restored
    },
    destroy: async (actor, id) => {
      const existing = await newsRepository.findAnyById(id)
      if (!existing) throw ApiError.notFound('News not found')
      await newsRepository.deleteById(id)
      await auditLogRepository.record({
        actor: actor.id,
        action: 'NEWS_DELETED',
        entity: 'News',
        entityId: id,
        metadata: { title: existing.title },
      })
      return { id }
    },
    listExpired: async (before) => {
      const rows = await newsRepository.listTrashed()
      return rows.filter((row) => row.deletedAt <= before)
    },
    label: (row) => row.title,
  },
}

function typeOf(type) {
  const entry = TYPES[type]
  if (!entry) throw ApiError.badRequest('Unknown trash type', 'UNKNOWN_TRASH_TYPE')
  return entry
}

function expiresAt(deletedAt) {
  return new Date(new Date(deletedAt).getTime() + RETENTION_MS)
}

// Swept when the page is opened rather than on a timer: this deployment has
// no scheduler that is guaranteed to be running (see docs/deployment), and a
// bin that is only ever emptied while somebody is looking at it is still
// emptied — the retention promise is "recoverable for 30 days", not "gone at
// the stroke of midnight on day 31".
async function purgeExpired(actor) {
  const before = new Date(Date.now() - RETENTION_MS)
  let purged = 0

  for (const [type, entry] of Object.entries(TYPES)) {
    const expired = await entry.listExpired(before)
    for (const row of expired) {
      try {
        await entry.destroy(actor, row._id.toString())
        purged += 1
      } catch (error) {
        // One unhappy row must not stop the sweep or break the page it runs
        // under; it will be retried on the next visit.
        logger.warn('Failed to purge expired trash entry', {
          type,
          id: row._id.toString(),
          error: error instanceof Error ? error.message : error,
        })
      }
    }
  }

  return purged
}

export const trashService = {
  TRASH_RETENTION_DAYS,

  async list(actor) {
    const purged = await purgeExpired(actor)

    const rows = []
    for (const [type, entry] of Object.entries(TYPES)) {
      for (const row of await entry.listTrashed()) {
        rows.push({ type, row })
      }
    }

    // One lookup for every "deleted by" name on the page.
    const deleterIds = [...new Set(rows.map(({ row }) => row.deletedBy?.toString()).filter(Boolean))]
    const users = await userRepository.findByIds(deleterIds)
    const usersById = new Map(users.map((user) => [user._id.toString(), user]))

    const items = rows
      .map(({ type, row }) => ({
        type,
        id: row._id.toString(),
        title: TYPES[type].label(row),
        status: row.status ?? '',
        deletedAt: row.deletedAt,
        expiresAt: expiresAt(row.deletedAt),
        deletedByName: usersById.get(row.deletedBy?.toString())?.fullName ?? '',
      }))
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))

    return { items, retentionDays: TRASH_RETENTION_DAYS, purged }
  },

  restore(actor, type, id) {
    return typeOf(type).restore(actor, id)
  },

  destroy(actor, type, id) {
    return typeOf(type).destroy(actor, id)
  },
}
