import { AttentionPolicy } from '../models/attentionPolicy.model.js'

// Mongo rejects an update that names the same path in both $set and $unset,
// and an empty $unset object, so both are only attached when non-empty.
function buildUpdate(set = {}, unset = [], updatedBy) {
  const update = { $set: { ...set, updatedBy } }
  const fields = unset.filter((field) => !(field in set))
  if (fields.length) {
    update.$unset = Object.fromEntries(fields.map((field) => [field, '']))
  }
  return update
}

export const attentionPolicyRepository = {
  findGlobal() {
    return AttentionPolicy.findOne({ scope: 'GLOBAL' })
  },

  findByCourse(courseId) {
    return AttentionPolicy.findOne({ scope: 'COURSE', courseId })
  },

  // `set` carries the fields being given a value, `unset` the ones being
  // handed back to the layer above — an override has to be able to stop
  // overriding, which storing a value can't express.
  //
  // Upserts rather than updates: the GLOBAL row is created lazily on the
  // first save instead of being seeded at boot, so an untouched install
  // simply runs on the shared defaults.
  upsertGlobal({ set, unset }, updatedBy) {
    return AttentionPolicy.findOneAndUpdate(
      { scope: 'GLOBAL', courseId: null },
      buildUpdate(set, unset, updatedBy),
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
  },

  upsertForCourse(courseId, { set, unset }, updatedBy) {
    return AttentionPolicy.findOneAndUpdate(
      { scope: 'COURSE', courseId },
      buildUpdate(set, unset, updatedBy),
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
  },

  // Dropping the override is how a course goes back to inheriting the global
  // policy — distinct from saving one that happens to match it today.
  deleteForCourse(courseId) {
    return AttentionPolicy.deleteOne({ scope: 'COURSE', courseId })
  },
}
