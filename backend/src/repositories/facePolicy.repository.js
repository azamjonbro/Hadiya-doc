import { FacePolicy } from '../models/facePolicy.model.js'

// Mongo rejects an update naming the same path in both $set and $unset, and
// an empty $unset object, so both are only attached when non-empty. Mirrors
// attentionPolicy.repository.js, which has the same "null means inherit"
// contract to honour.
function buildUpdate(set = {}, unset = [], updatedBy) {
  const update = { $set: { ...set, updatedBy } }
  const fields = unset.filter((field) => !(field in set))
  if (fields.length) {
    update.$unset = Object.fromEntries(fields.map((field) => [field, '']))
  }
  return update
}

export const facePolicyRepository = {
  findGlobal() {
    return FacePolicy.findOne({ scope: 'GLOBAL' })
  },

  // Upsert rather than update: the row is created lazily on the first save
  // instead of being seeded at boot.
  upsertGlobal({ set, unset }, updatedBy) {
    return FacePolicy.findOneAndUpdate({ scope: 'GLOBAL' }, buildUpdate(set, unset, updatedBy), {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    })
  },
}
