import { coursesApi } from '@/services/courses'
import { lessonsApi } from '@/services/lessons'
import { materialsApi } from '@/services/materials'
import { STORES, idb, isOfflineStorageAvailable, requestPersistence, storageEstimate } from './db.js'
import { fitsInStorage, planCourseDownload } from './offlinePlan.js'

/**
 * Taking a course offline, and reading it back (12.2).
 *
 * Downloading is a **deliberate act by the learner**, not a cache that
 * fills itself: they press a button, they are told what it will cost, and
 * they can delete it. That is also why the service worker does not cache
 * API responses (12.1) — a course somebody chose to keep is a different
 * thing from a stale response they never asked for.
 *
 * What is saved: the course's table of contents, its **text lessons**, and
 * its **documents**. Not video (HLS behind a short-lived playback token —
 * a "saved" video would stop playing with no explanation), not assessments
 * (their questions on disk is an integrity problem), not SCORM (it needs
 * the API's launcher page and a same-origin runtime).
 */

const emptyRecord = { courseId: null, savedAt: null, bytes: 0, lessons: [], materials: [], skipped: [] }

export function isSupported() {
  return isOfflineStorageAvailable()
}

/** Everything the course page needs, gathered the way the page gathers it. */
async function collect(courseId) {
  const [course, topics] = await Promise.all([coursesApi.getById(courseId), coursesApi.listTopics(courseId)])
  const [lessonLists, materialLists] = await Promise.all([
    Promise.all(topics.map((topic) => lessonsApi.listByTopic(topic.id).catch(() => []))),
    Promise.all(topics.map((topic) => materialsApi.listByTopic(topic.id).catch(() => []))),
  ])
  const lessonsByTopic = Object.fromEntries(topics.map((topic, i) => [topic.id, lessonLists[i]]))
  const materialsByTopic = Object.fromEntries(topics.map((topic, i) => [topic.id, materialLists[i]]))
  return { course, topics, lessonsByTopic, materialsByTopic }
}

/**
 * What saving this course would involve — asked *before* downloading.
 *
 * The UI shows this: how many items, how large, and what will be skipped.
 * A progress bar that starts and then quietly drops a file is how somebody
 * ends up offline without the document they needed.
 */
export async function planFor(courseId) {
  const collected = await collect(courseId)
  const plan = planCourseDownload(collected)
  const estimate = await storageEstimate()
  return { ...plan, collected, estimate, fits: fitsInStorage(plan.estimatedBytes, estimate) }
}

/**
 * Downloads and stores.
 *
 * @param {(state: {done: number, total: number, title: string}) => void} [onProgress]
 */
export async function saveCourse(courseId, { onProgress } = {}) {
  const { collected, lessons, materials, skipped, fits } = await planFor(courseId)
  if (!fits.ok) throw Object.assign(new Error('Not enough room'), { code: fits.reason })

  // Asked once, here, rather than at startup: a permission prompt makes
  // sense next to the action that needs it.
  await requestPersistence()

  const total = lessons.length + materials.length
  let done = 0
  let bytes = 0
  const report = (title) => onProgress?.({ done, total, title })

  for (const lesson of lessons) {
    const full = await lessonsApi.getById(lesson.id)
    await idb.put(STORES.lessons, lesson.id, { ...full, courseId, savedAt: Date.now() })
    bytes += JSON.stringify(full).length
    done += 1
    report(lesson.title)
  }

  for (const material of materials) {
    // The same endpoint the in-browser viewers use, so what is stored is
    // exactly what would have been rendered online — no second path that
    // can disagree.
    const buffer = await materialsApi.getContent(material.id)
    const blob = new Blob([buffer], { type: material.mimeType || 'application/octet-stream' })
    await idb.put(STORES.blobs, material.id, blob)
    await idb.put(STORES.materials, material.id, { ...material, courseId, bytes: blob.size, savedAt: Date.now() })
    bytes += blob.size
    done += 1
    report(material.title)
  }

  const record = {
    courseId,
    savedAt: Date.now(),
    bytes,
    title: collected.course.title,
    // The table of contents, so the course page renders with no network.
    topics: collected.topics.map((topic) => ({ id: topic.id, title: topic.title, order: topic.order })),
    lessons,
    materials,
    skipped,
  }
  await idb.put(STORES.courses, courseId, record)
  return record
}

/** What is saved for one course, or null. */
export async function savedCourse(courseId) {
  if (!isSupported()) return null
  try {
    return (await idb.get(STORES.courses, courseId)) ?? null
  } catch {
    // Storage refused (private window, site data blocked): the same answer
    // as "nothing saved", which is what the UI has to draw anyway.
    return null
  }
}

export async function listSaved() {
  if (!isSupported()) return []
  try {
    const rows = await idb.getAll(STORES.courses)
    return rows.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  } catch {
    return []
  }
}

/** Removes a course and everything that belonged to it. */
export async function removeCourse(courseId) {
  const record = await savedCourse(courseId)
  if (!record) return { removed: false }
  for (const lesson of record.lessons ?? []) await idb.del(STORES.lessons, lesson.id)
  for (const material of record.materials ?? []) {
    await idb.del(STORES.blobs, material.id)
    await idb.del(STORES.materials, material.id)
  }
  await idb.del(STORES.courses, courseId)
  return { removed: true, bytes: record.bytes ?? 0 }
}

export async function removeAll() {
  if (!isSupported()) return { removed: 0 }
  const rows = await listSaved()
  for (const name of Object.values(STORES)) await idb.clear(name)
  return { removed: rows.length }
}

/** A saved lesson, for the reader when the request fails or there is no network. */
export async function offlineLesson(lessonId) {
  if (!isSupported()) return null
  try {
    return (await idb.get(STORES.lessons, lessonId)) ?? null
  } catch {
    return null
  }
}

/** A saved document's bytes, as an ArrayBuffer — what the viewers take. */
export async function offlineMaterialContent(materialId) {
  if (!isSupported()) return null
  try {
    const blob = await idb.get(STORES.blobs, materialId)
    return blob ? await blob.arrayBuffer() : null
  } catch {
    return null
  }
}

export async function offlineMaterialMeta(materialId) {
  if (!isSupported()) return null
  try {
    return (await idb.get(STORES.materials, materialId)) ?? null
  } catch {
    return null
  }
}

export { emptyRecord }
