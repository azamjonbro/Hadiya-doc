import { Schema, model } from 'mongoose'

const newsSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // Plain text/markdown-lite by design, not rich HTML — this sidesteps
    // needing server-side HTML sanitization entirely (Vue auto-escapes on
    // render); see docs/security-threat-model.md.
    content: { type: String, required: true },
    cover: { type: String, default: '' },
    // The line under the title (rasn 25's "Подзаголовок"); plain text like
    // the body.
    subtitle: { type: String, default: '', trim: true, maxlength: 300 },
    // A banner (rasn 24's "Баннеры"): pinned articles lead the portal's
    // slider in this order, newest pin first. Null = not a banner.
    pinnedAt: { type: Date, default: null },
    images: { type: [String], default: [] },
    attachments: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    departmentTargets: { type: [String], default: [] },
    roleTargets: { type: [String], default: [] },
    publishAt: { type: Date, default: Date.now },
    expiryAt: { type: Date, default: null },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    // Soft delete — see course.model.js. Deleted articles wait in the trash
    // for the retention window instead of disappearing on one click.
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

newsSchema.index({ publishAt: -1 })
newsSchema.index({ tags: 1 })

export const News = model('News', newsSchema)
