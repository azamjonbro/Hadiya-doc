import { Course } from '../../models/course.model.js'
import { Topic } from '../../models/topic.model.js'
import { News } from '../../models/news.model.js'
import { LearningPath } from '../../models/learningPath.model.js'
import { User } from '../../models/user.model.js'
import { Settings } from '../../models/settings.model.js'
import { CertificateTemplate } from '../../models/certificateTemplate.model.js'
import { Lesson } from '../../models/lesson.model.js'

/**
 * Where an image is used, asked rather than remembered.
 *
 * The alternative is a usage counter maintained by every writer that can
 * attach an image — course update, news, the lesson block editor, the
 * certificate designer, an avatar change. Counters like that drift, and
 * they drift silently: the one that says "2 places" when the answer is zero
 * is what makes a delete button dangerous. A query is slower and correct.
 *
 * Two forms are matched because the platform stores both: most fields hold
 * the public URL, while a certificate template holds the bare key (it
 * renders the background server-side and never needs a browser URL).
 */
const PLACES = [
  { model: () => Course, field: 'cover', entity: 'Course', label: 'title' },
  { model: () => Course, field: 'banner', entity: 'Course', label: 'title' },
  { model: () => Topic, field: 'cover', entity: 'Topic', label: 'title' },
  { model: () => Topic, field: 'banner', entity: 'Topic', label: 'title' },
  { model: () => News, field: 'cover', entity: 'News', label: 'title' },
  { model: () => LearningPath, field: 'cover', entity: 'LearningPath', label: 'title' },
  { model: () => User, field: 'avatar', entity: 'User', label: 'fullName' },
  { model: () => Settings, field: 'logoUrl', entity: 'Settings', label: 'id' },
]

export const mediaUsageService = {
  /**
   * @returns {Promise<Array<{entity: string, entityId: string, field: string, label: string}>>}
   */
  async find({ url, key }) {
    const uses = []
    const candidates = [url, key].filter(Boolean)
    if (!candidates.length) return uses

    for (const place of PLACES) {
      const rows = await place
        .model()
        .find({ [place.field]: { $in: candidates } }, { [place.label]: 1 })
        .limit(50)
        .lean()
      rows.forEach((row) => {
        uses.push({
          entity: place.entity,
          entityId: String(row._id),
          field: place.field,
          label: String(row[place.label] ?? ''),
        })
      })
    }

    // Certificate templates hold the key, not a URL.
    if (key) {
      const templates = await CertificateTemplate.find({ backgroundKey: key }, { name: 1 }).limit(50).lean()
      templates.forEach((row) => {
        uses.push({ entity: 'CertificateTemplate', entityId: String(row._id), field: 'backgroundKey', label: row.name ?? '' })
      })
    }

    // Lesson blocks: an IMAGE block's url, or any image inside a GALLERY.
    // Matched on the two array paths rather than by scanning every lesson —
    // Mongo can index neither, but it can at least do the filtering.
    if (url) {
      const lessons = await Lesson.find(
        { $or: [{ 'blocks.url': url }, { 'blocks.items.url': url }] },
        { title: 1 }
      )
        .limit(50)
        .lean()
      lessons.forEach((row) => {
        uses.push({ entity: 'Lesson', entityId: String(row._id), field: 'blocks', label: row.title ?? '' })
      })
    }

    return uses
  },

  /** Every image URL and key the platform currently points at. */
  async referencedImages() {
    const urls = new Set()
    const keys = new Set()

    for (const place of PLACES) {
      const rows = await place
        .model()
        .find({ [place.field]: { $nin: ['', null] } }, { [place.field]: 1 })
        .lean()
      rows.forEach((row) => {
        const value = row[place.field]
        if (value) urls.add(String(value))
      })
    }

    const templates = await CertificateTemplate.find({ backgroundKey: { $nin: ['', null] } }, { backgroundKey: 1 }).lean()
    templates.forEach((row) => keys.add(String(row.backgroundKey)))

    // Lesson blocks, read in one pass: a lesson can hold a dozen images and
    // there is no index that would help, so the whole (small) collection is
    // walked rather than queried per asset.
    const lessons = await Lesson.find({}, { blocks: 1 }).lean()
    lessons.forEach((lesson) => {
      ;(lesson.blocks ?? []).forEach((block) => {
        if (block.url) urls.add(String(block.url))
        ;(block.items ?? []).forEach((item) => {
          if (item.url) urls.add(String(item.url))
        })
      })
    })

    return { urls, keys }
  },
}
