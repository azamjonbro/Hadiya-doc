import { Schema, model } from 'mongoose'

const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const Role = model('Role', roleSchema)
