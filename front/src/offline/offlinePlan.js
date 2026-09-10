/**
 * What a course takes offline, and what it refuses to (12.2).
 *
 * Pure functions, separate from IndexedDB and from the network, because
 * these are the decisions worth arguing about — and the only part of this
 * feature that can be tested without a browser.
 */

/**
 * Files above this are skipped, with a note.
 *
 * Not a technical limit: a 60 MB scan of a manual is a file somebody would
 * not knowingly download on a phone in a corridor, and silently spending
 * their data on it is worse than telling them it stayed online.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

/**
 * And a ceiling for the whole course, for the same reason at a different
 * scale: a course of forty documents is not something to hand somebody as
 * one button press.
 */
export const MAX_COURSE_BYTES = 200 * 1024 * 1024

// Leave the browser some room rather than filling its quota: everything
// else the app stores (the precache, the session, the settings) lives in
// the same budget.
export const QUOTA_HEADROOM_BYTES = 50 * 1024 * 1024

/**
 * Which kinds can be taken offline at all.
 *
 * **Lessons and documents only.** Video is HLS segments behind a
 * short-lived playback token — the token expires, so a "saved" video would
 * stop playing without explanation, and the segment count makes the size
 * unpredictable. An assessment offline means its questions on disk, which
 * is an integrity problem, not a feature. SCORM needs the API's launcher
 * page and a same-origin runtime.
 */
export const OFFLINE_KINDS = ['LESSON', 'MATERIAL']

/**
 * The API calls it `fileSize` (that is what the viewer reads too); some
 * payloads carry `sizeBytes`. Read both rather than silently treating a
 * 40 MB scan as size zero, which is what happened the first time — the
 * cap existed and never applied to anything.
 */
export function materialSize(material) {
  const value = material?.fileSize ?? material?.sizeBytes
  return typeof value === 'number' ? value : null
}

/** A document we can actually store and re-open later. */
export function isSavableMaterial(material) {
  if (!material) return false
  const size = materialSize(material)
  if (size != null && size > MAX_FILE_BYTES) return false
  // Audio is a material in this platform, and often the largest one; it
  // plays from a blob perfectly well, so the size cap is the only gate.
  return true
}

/**
 * The plan: what will be saved, what will be skipped, and why.
 *
 * Returned rather than acted on, so the UI can say "3 documents, 8 MB —
 * one file skipped because it is too large" **before** anything is
 * downloaded. A progress bar that starts and then quietly drops things is
 * how somebody ends up offline without the file they needed.
 */
export function planCourseDownload({ topics = [], lessonsByTopic = {}, materialsByTopic = {} }) {
  const lessons = []
  const materials = []
  const skipped = []

  for (const topic of topics) {
    for (const lesson of lessonsByTopic[topic.id] ?? []) {
      // Only published content: a draft is the author's work in progress,
      // and it is not visible to a learner online either.
      if (lesson.status && lesson.status !== 'PUBLISHED') continue
      lessons.push({ id: lesson.id, topicId: topic.id, title: lesson.title })
    }
    for (const material of materialsByTopic[topic.id] ?? []) {
      if (material.status && material.status !== 'PUBLISHED') continue
      if (!isSavableMaterial(material)) {
        skipped.push({ id: material.id, title: material.title, reason: 'TOO_LARGE', sizeBytes: materialSize(material) ?? 0 })
        continue
      }
      materials.push({
        id: material.id,
        topicId: topic.id,
        title: material.title,
        mimeType: material.mimeType ?? '',
        sizeBytes: materialSize(material) ?? 0,
      })
    }
  }

  // Lessons are JSON of a few kilobytes; only the documents are worth
  // predicting a size for, and even that is the server's number rather
  // than a guess.
  const estimatedBytes = materials.reduce((sum, material) => sum + (material.sizeBytes || 0), 0)
  return { lessons, materials, skipped, estimatedBytes, itemCount: lessons.length + materials.length }
}

/**
 * Whether there is room, given what the browser says.
 *
 * A missing estimate reads as "go ahead": refusing to save because the
 * browser would not report its quota would be refusing on no evidence.
 */
export function fitsInStorage(estimatedBytes, { available }) {
  if (estimatedBytes > MAX_COURSE_BYTES) return { ok: false, reason: 'COURSE_TOO_LARGE' }
  if (available == null) return { ok: true, reason: null }
  if (estimatedBytes + QUOTA_HEADROOM_BYTES > available) return { ok: false, reason: 'NOT_ENOUGH_SPACE' }
  return { ok: true, reason: null }
}

/** For the UI: "8,4 MB". Locale-aware, because 8.4 and 8,4 are different. */
export function formatBytes(bytes, locale = 'uz') {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB']
  let scaled = value / 1024
  let unit = 0
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024
    unit += 1
  }
  return `${scaled.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units[unit]}`
}
