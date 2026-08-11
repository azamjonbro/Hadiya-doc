import { Role } from '../models/role.model.js'

export const roleRepository = {
  findById(id) {
    return Role.findById(id)
  },

  findByName(name) {
    return Role.findOne({ name: name.toUpperCase() })
  },

  findAll() {
    return Role.find().sort({ name: 1 })
  },
}
