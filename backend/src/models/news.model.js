import { Schema, model } from 'mongoose'

const newsSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // Plain text/markdown-lite by design, not rich HTML — this sidesteps
    // needing server-side HTML sanitization entirely (Vue auto-escapes on
    // render); see docs/security-threat-model.md.
    content: { type: String, required: true },
    cover: { type: String, default: '' },
    images: { type: [String], default: [] },
    attachments: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    departmentTargets: { type: [String], default: [] },
    roleTargets: { type: [String], default: [] },
    publishAt: { type: Date, default: Date.now },
    expiryAt: { type: Date, default: null },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

newsSchema.index({ publishAt: -1 })
newsSchema.index({ tags: 1 })

export const News = model('News', newsSchema)
