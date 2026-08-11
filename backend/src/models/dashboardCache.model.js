import { Schema, model } from 'mongoose'

// Materialized fallback for the admin dashboard (spec §38) — Redis is the
// primary cache (fast, TTL'd); this single document is what the dashboard
// reads if Redis is unreachable or was flushed. Written by the same
// scheduled job that writes Redis, so the two are never far apart. There is
// exactly one document, keyed by `key`.
const dashboardCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'admin-dashboard' },
    payload: { type: Schema.Types.Mixed, required: true },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: true }
)

export const DashboardCache = model('DashboardCache', dashboardCacheSchema)
