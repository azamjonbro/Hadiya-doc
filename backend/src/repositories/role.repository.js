import { Role } from '../models/role.model.js'

export const roleRepository = {
  findById(id) {
    return Role.findById(id)
  },

  findByIds(ids) {
    return Role.find({ _id: { $in: ids } })
  },

  findByName(name) {
    return Role.findOne({ name: name.toUpperCase() })
  },

  findAll() {
    return Role.find().sort({ name: 1 })
  },
}
