import { ATTENTION_POLICY_FIELDS, resolveAttentionPolicy } from '@lms/shared'
import { attentionPolicyRepository } from '../../repositories/attentionPolicy.repository.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'

// Read on every video page load and changed almost never, so it is cached the
// same way course metadata is. The key is per course because that is the only
// form anyone actually asks for.
const POLICY_CACHE_TTL = 5 * 60
// Exported so course.service.js can drop it when a course is hard-deleted,
// instead of the key format being spelled out in two places.
export const effectiveCacheKey = (courseId) => `attention-policy:course:${courseId}`

// Only the known policy fields are ever copied out of a request body, so an
// unexpected key can't be written into the document.
function splitSettings(payload) {
  const set = {}
  const unset = []
  for (const field of ATTENTION_POLICY_FIELDS) {
    if (!(field in payload)) continue
    if (payload[field] === null) unset.push(field)
    else set[field] = payload[field]
  }
  return { set, unset }
}

// Mongoose documents carry every schema path, including the ones left unset;
// stripping them here is what keeps "inherit" distinguishable from "false"
// once the row crosses into JSON.
function toStoredSettings(doc) {
  if (!doc) return null
  const stored = {}
  for (const field of ATTENTION_POLICY_FIELDS) {
    if (doc[field] !== undefined && doc[field] !== null) stored[field] = doc[field]
  }
  return stored
}

export const attentionPolicyService = {
  // The full three-layer answer: defaults, then global, then this course.
  // This is what the player enforces.
  async getEffectiveForCourse(courseId) {
    const cached = await cacheGet(effectiveCacheKey(courseId))
    if (cached) return cached

    const [global, override] = await Promise.all([
      attentionPolicyRepository.findGlobal(),
      attentionPolicyRepository.findByCourse(courseId),
    ])
    const effective = resolveAttentionPolicy(toStoredSettings(global), toStoredSettings(override))
    await cacheSet(effectiveCacheKey(courseId), effective, POLICY_CACHE_TTL)
    return effective
  },

  // Admin-facing shape: the resolved global policy plus which fields are
  // actually stored, so the UI can show "inherited" vs "set here".
  async getGlobal() {
    const global = await attentionPolicyRepository.findGlobal()
    const stored = toStoredSettings(global)
    return { effective: resolveAttentionPolicy(stored), stored: stored ?? {} }
  },

  async getForCourse(courseId) {
    const course = await courseRepository.findById(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    const [global, override] = await Promise.all([
      attentionPolicyRepository.findGlobal(),
      attentionPolicyRepository.findByCourse(courseId),
    ])
    const globalSettings = toStoredSettings(global)
    const overrideSettings = toStoredSettings(override)
    return {
      effective: resolveAttentionPolicy(globalSettings, overrideSettings),
      inherited: resolveAttentionPolicy(globalSettings),
      stored: overrideSettings ?? {},
      hasOverride: Boolean(override),
    }
  },

  async updateGlobal(actor, payload) {
    const updated = await attentionPolicyRepository.upsertGlobal(splitSettings(payload), actor.id)
    // Every course's effective policy sits on top of this one, so none of the
    // per-course cache entries can be trusted afterwards.
    await this.invalidateAll()
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ATTENTION_POLICY_UPDATED',
      entity: 'AttentionPolicy',
      entityId: 'GLOBAL',
      metadata: { fields: Object.keys(payload) },
    })
    return { effective: resolveAttentionPolicy(toStoredSettings(updated)), stored: toStoredSettings(updated) }
  },

  async updateForCourse(actor, courseId, payload) {
    const course = await courseRepository.findById(courseId)
    if (!course) throw ApiError.notFound('Course not found')

    await attentionPolicyRepository.upsertForCourse(courseId, splitSettings(payload), actor.id)
    await cacheDel(effectiveCacheKey(courseId))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ATTENTION_POLICY_UPDATED',
      entity: 'AttentionPolicy',
      entityId: courseId,
      metadata: { courseTitle: course.title, fields: Object.keys(payload) },
    })
    return this.getForCourse(courseId)
  },

  async removeCourseOverride(actor, courseId) {
    await attentionPolicyRepository.deleteForCourse(courseId)
    await cacheDel(effectiveCacheKey(courseId))
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ATTENTION_POLICY_RESET',
      entity: 'AttentionPolicy',
      entityId: courseId,
    })
    return this.getForCourse(courseId)
  },

  // A global change invalidates every course entry. There is no key pattern
  // delete in the cache helper, so each course is cleared by id — the course
  // count here is in the hundreds, not millions.
  async invalidateAll() {
    const courses = await courseRepository.listAllIds()
    await Promise.all(courses.map((id) => cacheDel(effectiveCacheKey(id))))
  },
}
