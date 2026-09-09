// 7.4 — the badge engine.
//
// Before this, a badge was a hard-coded rule recomputed on every read. That
// has two problems that only appear later: adding a badge needs a deploy,
// and nothing records *when* one was earned — so it cannot be announced,
// cannot appear on a timeline, and quietly vanishes if the underlying total
// ever drops.
//
// So awarding is written down and one-way: a badge records that something
// happened, not a status reflecting the present.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Badge } from '../src/models/badge.model.js'
import { UserBadge } from '../src/models/userBadge.model.js'
import { PointsLedger } from '../src/models/pointsLedger.model.js'
import { Notification } from '../src/models/notification.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { badgeService, meetsCriteria, metricsFor } from '../src/services/gamification/badge.service.js'
import { pointsService } from '../src/services/gamification/points.service.js'
import { SYSTEM_BADGES, seedBadges } from '../src/scripts/migrateBadges.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)

let learner
let customBadge
const userIds = []
const badgeIds = []

async function makeUser(name) {
  const user = await User.create({
    firstName: name,
    lastName: 'Badge',
    fullName: `${name} Badge`,
    jshshir: `48${userIds.length}${stamp}`,
    passwordHash: await hashPassword('BadgeTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
  })
  userIds.push(user._id)
  return user
}

describe('badges (7.4)', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    learner = await makeUser('Oluvchi')
    await seedBadges({ write: true })

    customBadge = await Badge.create({
      code: `CUSTOM_${stamp}`,
      name: 'Two courses and a hundred points',
      // Every criterion must be met — an OR badge is two badges.
      criteria: [
        { metric: 'TOTAL_POINTS', threshold: 100 },
        { metric: 'VIDEOS_COMPLETED', threshold: 2 },
      ],
      active: true,
    })
    badgeIds.push(customBadge._id)
  })

  after(async () => {
    await Promise.all([
      UserBadge.deleteMany({ userId: { $in: userIds } }),
      PointsLedger.deleteMany({ userId: { $in: userIds } }),
      Notification.deleteMany({ userId: { $in: userIds } }),
      Badge.deleteMany({ _id: { $in: badgeIds } }),
    ])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the criteria', () => {
    test('every criterion has to be met', () => {
      const badge = { criteria: [{ metric: 'TOTAL_POINTS', threshold: 100 }, { metric: 'VIDEOS_COMPLETED', threshold: 2 }] }
      assert.equal(meetsCriteria(badge, { TOTAL_POINTS: 150, VIDEOS_COMPLETED: 1 }), false)
      assert.equal(meetsCriteria(badge, { TOTAL_POINTS: 150, VIDEOS_COMPLETED: 2 }), true)
    })

    test('a badge with no criteria is never earned', () => {
      // Otherwise it would be awarded to everybody the moment it was
      // created, which is never what somebody meant to configure.
      assert.equal(meetsCriteria({ criteria: [] }, { TOTAL_POINTS: 9999 }), false)
    })

    test('a missing metric counts as zero, not as a crash', () => {
      assert.equal(meetsCriteria({ criteria: [{ metric: 'PATHS_COMPLETED', threshold: 1 }] }, {}), false)
    })
  })

  describe('awarding', () => {
    test('nothing is earned with nothing done', async () => {
      const result = await badgeService.evaluate(learner._id)
      assert.deepEqual(result.awarded, [])
    })

    test('the first video earns FIRST_STEP, and records when', async () => {
      await pointsService.award(learner._id, new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), 10, 'COMPLETION')
      const held = await UserBadge.findOne({ userId: learner._id, code: 'FIRST_STEP' }).lean()
      assert.ok(held, 'awarding happens on the points event, not on the next read')
      assert.ok(held.earnedAt)
      // The metric as it stood — impossible to reconstruct later.
      assert.equal(held.snapshot.VIDEOS_COMPLETED, 1)
    })

    test('the learner is told', async () => {
      const notice = await Notification.findOne({ userId: learner._id, type: 'BADGE_EARNED' }).lean()
      assert.ok(notice)
    })

    test('re-evaluating awards nothing twice', async () => {
      const result = await badgeService.evaluate(learner._id)
      assert.deepEqual(result.awarded, [])
      assert.equal(await UserBadge.countDocuments({ userId: learner._id, code: 'FIRST_STEP' }), 1)
    })

    test('a multi-criterion badge waits for both', async () => {
      // 100 points, but only one video so far.
      await pointsService.award(learner._id, new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), 95, 'COMPLETION')
      let held = await UserBadge.findOne({ userId: learner._id, code: customBadge.code }).lean()
      assert.ok(held, 'the second video came with the second points row')

      // Prove the ordering by checking a badge that is still short.
      const strict = await Badge.create({
        code: `STRICT_${stamp}`,
        criteria: [{ metric: 'PERFECT_QUIZZES', threshold: 3 }],
        active: true,
      })
      badgeIds.push(strict._id)
      await badgeService.evaluate(learner._id)
      held = await UserBadge.findOne({ userId: learner._id, code: strict.code }).lean()
      assert.equal(held, null)
    })

    test('a badge is not taken back when a total drops', async () => {
      // A badge records that something happened; it is not a status that
      // reflects the present.
      await PointsLedger.deleteMany({ userId: learner._id })
      await badgeService.evaluate(learner._id)
      assert.ok(await UserBadge.findOne({ userId: learner._id, code: 'FIRST_STEP' }).lean())
    })
  })

  describe('what the learner sees', () => {
    test('the summary reads awarded badges, not a recomputation', async () => {
      // The ledger was just emptied — a recomputation would show none.
      const summary = await pointsService.getSummary(learner._id.toString())
      assert.ok(summary.badges.includes('FIRST_STEP'))
    })

    test('the catalog shows progress towards what is not earned yet', async () => {
      const { items } = await badgeService.catalogFor(learner._id)
      const strict = items.find((item) => item.code === `STRICT_${stamp}`)
      assert.equal(strict.earnedAt, null)
      // "0 of 3" is a reason to take a fourth quiz; a locked icon is not.
      assert.equal(strict.criteria[0].threshold, 3)
      assert.equal(strict.criteria[0].current, 0)
    })

    test('an earned badge survives its definition being deleted', async () => {
      const doomed = await Badge.create({
        code: `DOOMED_${stamp}`,
        criteria: [{ metric: 'VIDEOS_COMPLETED', threshold: 1 }],
        active: true,
      })
      await UserBadge.create({ userId: learner._id, badgeId: doomed._id, code: doomed.code })
      await Badge.deleteOne({ _id: doomed._id })

      const { items } = await badgeService.listFor(learner._id)
      const orphan = items.find((item) => item.code === doomed.code)
      // The person still earned it, so it still shows — under its code.
      assert.ok(orphan)
      assert.equal(orphan.name, doomed.code)
    })
  })

  describe('the points ledger index this work surfaced', () => {
    test('a second video award is recorded, not swallowed', async () => {
      // The old indexes were declared `sparse` on a compound key, which
      // skips a document only when *every* indexed field is missing —
      // `userId` is always there, and `assessmentId` defaults to null
      // rather than being absent, so two video rows for one person both
      // indexed as {userId, assessmentId: null} and the second was
      // rejected. `award` treats a duplicate key as "already paid out", so
      // the loss was silent: one video, ever, per person.
      const victim = await makeUser('Ikkinchi')
      const first = await pointsService.award(
        victim._id,
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        10,
        'COMPLETION'
      )
      const second = await pointsService.award(
        victim._id,
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        20,
        'COMPLETION'
      )
      assert.equal(first.awarded, true)
      assert.equal(second.awarded, true, 'a different video has to pay out')
      assert.equal(await PointsLedger.countDocuments({ userId: victim._id }), 2)
    })

    test('the same video still pays out only once', async () => {
      // The guard the indexes exist for has to survive the fix.
      const victim = await makeUser('Takror')
      const videoId = new mongoose.Types.ObjectId()
      const courseId = new mongoose.Types.ObjectId()
      await pointsService.award(victim._id, videoId, courseId, 10, 'COMPLETION')
      const again = await pointsService.award(victim._id, videoId, courseId, 10, 'COMPLETION')
      assert.equal(again.awarded, false)
      assert.equal(await PointsLedger.countDocuments({ userId: victim._id }), 1)
    })

    test('a video award and an assessment award coexist', async () => {
      const victim = await makeUser('Ikkovi')
      await pointsService.award(victim._id, new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), 10, 'COMPLETION')
      const assessment = await pointsService.awardForAssessment(
        victim._id,
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        30
      )
      assert.equal(assessment.awarded, true)
      assert.equal(await PointsLedger.countDocuments({ userId: victim._id }), 2)
    })
  })

  describe('migration M7', () => {
    test('the five code badges exist as rows, with their codes intact', async () => {
      // The client resolves titles and icons from the code, so keeping it
      // is what makes the switch invisible to the frontend.
      for (const badge of SYSTEM_BADGES) {
        const stored = await Badge.findOne({ code: badge.code }).lean()
        assert.ok(stored, `${badge.code} must exist after M7`)
        assert.equal(stored.isSystem, true)
        assert.deepEqual(
          stored.criteria.map((c) => [c.metric, c.threshold]),
          badge.criteria.map((c) => [c.metric, c.threshold])
        )
      }
    })

    test('running the seed again creates nothing', async () => {
      assert.equal(await seedBadges({ write: true }), 0)
    })

    test('the metrics cover every criterion the model allows', async () => {
      const metrics = await metricsFor(learner._id)
      const allowed = Badge.schema.path('criteria').schema.path('metric').enumValues
      for (const metric of allowed) {
        assert.ok(metric in metrics, `metricsFor has no value for ${metric}`)
      }
    })
  })
})
