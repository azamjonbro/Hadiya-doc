/**
 * Migration M7 — badges become rows.
 *
 * Two parts.
 *
 * The five badges that shipped as code (`gamification/badgeDefinitions.js`)
 * become documents, keeping their codes. The code is what the client
 * resolves titles and icons from, so keeping it is what makes the switch
 * invisible to the frontend.
 *
 * Then everybody who already qualifies is awarded them. Without that, the
 * day this ships every employee loses the badges they had — they were
 * computed on read, so they only existed while the read was happening.
 * `earnedAt` for a backfilled badge is set to now, because the real moment
 * was never recorded; the alternative is a made-up date, which is worse
 * than an honest one.
 *
 *   npm --prefix backend run migrate:badges -- --dry-run
 *   npm --prefix backend run migrate:badges
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { Badge } from '../models/badge.model.js'
import { UserBadge } from '../models/userBadge.model.js'
import { User } from '../models/user.model.js'
import { badgeService, metricsFor, meetsCriteria } from '../services/gamification/badge.service.js'

const dryRun = process.argv.includes('--dry-run')

/**
 * The five, as rows.
 *
 * The thresholds are exactly the ones in badgeDefinitions.js. QUIZ_TAKER
 * and QUIZ_MASTER counted `quizzesPassed` only; the row counts assessments
 * too, which is a deliberate widening — the split was an implementation
 * detail the learner never saw, and 4.2 merged the two models anyway.
 */
export const SYSTEM_BADGES = [
  {
    code: 'FIRST_STEP',
    icon: 'play',
    tier: 'BRONZE',
    order: 1,
    criteria: [{ metric: 'VIDEOS_COMPLETED', threshold: 1 }],
  },
  {
    code: 'QUIZ_TAKER',
    icon: 'check-square',
    tier: 'BRONZE',
    order: 2,
    criteria: [{ metric: 'QUIZZES_PASSED', threshold: 1 }],
  },
  {
    code: 'QUIZ_MASTER',
    icon: 'award',
    tier: 'SILVER',
    order: 3,
    criteria: [{ metric: 'QUIZZES_PASSED', threshold: 5 }],
  },
  {
    code: 'POINTS_100',
    icon: 'star',
    tier: 'BRONZE',
    order: 4,
    criteria: [{ metric: 'TOTAL_POINTS', threshold: 100 }],
  },
  {
    code: 'POINTS_500',
    icon: 'flame',
    tier: 'GOLD',
    order: 5,
    criteria: [{ metric: 'TOTAL_POINTS', threshold: 500 }],
  },
]

export async function seedBadges({ write = true } = {}) {
  let created = 0
  for (const badge of SYSTEM_BADGES) {
    const existing = await Badge.findOne({ code: badge.code })
    if (existing) continue
    created += 1
    if (write) await Badge.create({ ...badge, isSystem: true, active: true })
  }
  return created
}

/**
 * Awards the badges people already qualify for.
 *
 * Notifications are off: telling four hundred people they earned a badge
 * they have effectively held for months would be four hundred pieces of
 * noise on the morning of a deploy.
 */
export async function backfill({ write = true } = {}) {
  const users = await User.find({ isActive: true }, { _id: 1 }).lean()
  const badges = await Badge.find({ active: true }).lean()
  let awarded = 0

  for (const user of users) {
    if (write) {
      const result = await badgeService.evaluate(user._id, { notify: false })
      awarded += result.awarded.length
      continue
    }
    // Dry run: count without writing.
    const metrics = await metricsFor(user._id)
    const held = new Set(
      (await UserBadge.find({ userId: user._id }, { badgeId: 1 }).lean()).map((row) => String(row.badgeId))
    )
    awarded += badges.filter((badge) => !held.has(String(badge._id)) && meetsCriteria(badge, metrics)).length
  }

  return { users: users.length, awarded }
}

async function main() {
  await connectDatabase()

  const created = await seedBadges({ write: !dryRun })
  console.log(`${created} badge definition(s) to create (of ${SYSTEM_BADGES.length} system badges)`)

  const result = await backfill({ write: !dryRun })
  console.log(`${result.awarded} award(s) across ${result.users} active user(s)`)

  if (dryRun) console.log('\n--dry-run: nothing written')
  else console.log('\nWritten')

  await mongoose.connection.close()
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('migrateBadges.js')) {
  main().catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await mongoose.connection.close().catch(() => {})
    process.exit(1)
  })
}
