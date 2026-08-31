import { FACE_POLICY_FIELDS, resolveFacePolicy } from '@lms/shared'
import { facePolicyRepository } from '../../repositories/facePolicy.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { cacheGet, cacheSet, cacheDel } from '../../utils/cache.js'

// Read before every gated open and changed almost never, so it is cached the
// same way the attention policy is. One key, because there is one row.
const POLICY_CACHE_KEY = 'face-policy:global'
const POLICY_CACHE_TTL = 5 * 60

// Only the known fields are ever copied out of a request body, so an
// unexpected key cannot be written into the document.
function splitSettings(payload) {
  const set = {}
  const unset = []
  for (const field of FACE_POLICY_FIELDS) {
    if (!(field in payload)) continue
    if (payload[field] === null) unset.push(field)
    else set[field] = payload[field]
  }
  return { set, unset }
}

// Mongoose documents carry every schema path, including the unset ones;
// stripping them is what keeps "inherit" distinguishable from "false" once
// the row crosses into JSON.
function toStoredSettings(doc) {
  if (!doc) return null
  const stored = {}
  for (const field of FACE_POLICY_FIELDS) {
    if (doc[field] !== undefined && doc[field] !== null) stored[field] = doc[field]
  }
  return stored
}

export const facePolicyService = {
  // What the gate enforces. Cached, so flipping the checkbox takes effect on
  // the next open rather than after a redeploy — updateGlobal drops the key.
  async getEffective() {
    const cached = await cacheGet(POLICY_CACHE_KEY)
    if (cached) return cached

    const effective = resolveFacePolicy(toStoredSettings(await facePolicyRepository.findGlobal()))
    await cacheSet(POLICY_CACHE_KEY, effective, POLICY_CACHE_TTL)
    return effective
  },

  // Admin-facing shape: the resolved policy plus which fields are actually
  // stored, so the form can show "inherited" against "set here".
  async getGlobal() {
    const stored = toStoredSettings(await facePolicyRepository.findGlobal())
    return { effective: resolveFacePolicy(stored), stored: stored ?? {} }
  },

  async updateGlobal(actor, payload) {
    const updated = await facePolicyRepository.upsertGlobal(splitSettings(payload), actor.id)
    await cacheDel(POLICY_CACHE_KEY)
    await auditLogRepository.record({
      actor: actor.id,
      action: 'FACE_POLICY_UPDATED',
      entity: 'FacePolicy',
      entityId: 'GLOBAL',
      metadata: { fields: Object.keys(payload), values: payload },
    })
    const stored = toStoredSettings(updated)
    return { effective: resolveFacePolicy(stored), stored: stored ?? {} }
  },
}
