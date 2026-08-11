import { Schema, model } from 'mongoose'

const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    module: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
)

export const Permission = model('Permission', permissionSchema)
