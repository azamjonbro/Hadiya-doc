// 13.4 — the individual development plan.
//
// Two things are being proved here, and they are the two that decide whether
// a plan is worth anything:
//
//   the number nobody types   a COURSE goal is as done as the course record
//                             says, a COMPETENCY goal as done as the level
//                             somebody assessed. Typing a percentage onto
//                             either is refused rather than ignored.
//   the signature that means  approving a plan freezes the edition it read,
//   something                 and an edit afterwards makes a new one to
//                             approve — so "approved on 3 March" cannot be
//                             quietly rewritten on 4 March.
//
// And CPE credits are not a second ledger: they land in PointsLedger,
// exactly once per goal, guarded by a claim on the goal itself because the
// ledger's own unique indexes do not cover a row with no video and no
// assessment.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { DevelopmentPlan } from '../src/models/developmentPlan.model.js'
import { PlanReview } from '../src/models/planReview.model.js'
import { PointsLedger } from '../src/models/pointsLedger.model.js'
import { Competency } from '../src/models/competency.model.js'
import { UserCompetency } from '../src/models/userCompetency.model.js'
import { Course } from '../src/models/course.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { Notification } from '../src/models/notification.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { UserBadge } from '../src/models/userBadge.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { developmentPlanService } from '../src/services/developmentPlans/developmentPlan.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Devplan-${stamp}`
const OTHER_DEPT = `Devplan-other-${stamp}`
const POSITION = `Sotuvchi-${stamp}`

let employeeRole
let manager
let employee
let colleague
let outsider
let course
let competency
let plan
let courseGoalId
let competencyGoalId
let customGoalId
const userIds = []

// Actors are built by hand rather than by logging in: this exercises the
// service layer, and `assertWithinScope` reads exactly these fields off the
// token. A DEPARTMENT-scoped manager is fenced to their own department,
// which is what "outside your scope" has to mean below.
const managerActor = () => ({
  id: String(manager._id),
  roleName: 'MANAGER',
  scope: 'DEPARTMENT',
  permissions: ['devplan:manage'],
})
const employeeActor = (user) => ({
  id: String(user._id),
  roleName: 'EMPLOYEE',
  scope: 'SELF',
  permissions: ['devplan:read:own'],
})

async function makeUser(name, extra = {}) {
  const user = await User.create({
    firstName: name,
    lastName: 'Reja',
    fullName: `${name} Reja`,
    jshshir: `52${userIds.length}${stamp}`,
    passwordHash: await hashPassword('DevplanTest123!'),
    roleId: employeeRole._id,
    ...extra,
  })
  userIds.push(user._id)
  return user
}

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    return true
  })
}

describe('development plan (13.4)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    manager = await makeUser('Rahbar', { department: DEPT })
    employee = await makeUser('Xodim', { department: DEPT, position: POSITION, managerId: manager._id })
    colleague = await makeUser('Hamkasb', { department: DEPT, managerId: manager._id })
    outsider = await makeUser('Begona', { department: OTHER_DEPT })

    course = await Course.create({
      title: `Devplan course ${stamp}`,
      slug: `devplan-course-${stamp}`,
      status: 'PUBLISHED',
      createdBy: manager._id,
    })

    competency = await Competency.create({
      code: `DEVPLAN_${stamp}`,
      name: 'Muzokara olib borish',
      levels: [
        { value: 1, label: 'Boshlovchi' },
        { value: 2, label: 'O‘rta' },
        { value: 3, label: 'Ishonchli' },
        { value: 4, label: 'Ustoz' },
      ],
      requirements: [{ scope: 'POSITION', value: POSITION, valueKey: POSITION.toLowerCase(), level: 3 }],
      developmentCourseIds: [course._id],
      createdBy: manager._id,
    })
  })

  after(async () => {
    await Promise.all([
      DevelopmentPlan.deleteMany({ userId: { $in: userIds } }),
      PlanReview.deleteMany({ userId: { $in: userIds } }),
      PointsLedger.deleteMany({ userId: { $in: userIds } }),
      UserCompetency.deleteMany({ userId: { $in: userIds } }),
      UserBadge.deleteMany({ userId: { $in: userIds } }),
      Notification.deleteMany({ userId: { $in: userIds } }),
      CourseAssignment.deleteMany({ courseId: course._id }),
      AuditLog.deleteMany({ actor: { $in: userIds } }),
    ])
    await Competency.deleteOne({ _id: competency._id })
    await Course.deleteOne({ _id: course._id })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('writing a plan', () => {
    test('a manager writes one for their own person', async () => {
      plan = await developmentPlanService.create(managerActor(), {
        userId: String(employee._id),
        title: `2026 H2 ${stamp}`,
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-12-31'),
        status: 'ACTIVE',
        goals: [
          { type: 'COURSE', title: 'Muzokara kursi', courseId: String(course._id), cpeCredits: 5, weight: 2 },
          { type: 'COMPETENCY', title: 'Muzokarani 3-darajaga', competencyId: String(competency._id) },
          { type: 'CUSTOM', title: 'Kitob o‘qish', targetDate: new Date('2026-10-01') },
        ],
      })

      assert.equal(plan.goals.length, 3)
      assert.equal(plan.version, 1)
      assert.equal(plan.lockedVersion, null)
      courseGoalId = plan.goals[0].id
      competencyGoalId = plan.goals[1].id
      customGoalId = plan.goals[2].id
    })

    test('a competency goal takes its target from what the job requires', async () => {
      // Nothing was typed: the requirement on the competency (level 3 for
      // this position) is the target, and the level held today is the floor
      // the progress bar climbs from.
      const goal = plan.goals[1]
      assert.equal(goal.targetLevel, 3)
      assert.equal(goal.baseLevel, 0)
    })

    test('a manager cannot write outside their own people', async () => {
      await rejects(
        developmentPlanService.create(managerActor(), {
          userId: String(outsider._id),
          title: 'Begona reja',
          periodStart: new Date('2026-07-01'),
          periodEnd: new Date('2026-12-31'),
        }),
        'DEVPLAN_SCOPE_FORBIDDEN'
      )
    })

    test('and cannot add a goal to a plan outside their scope', async () => {
      const foreign = await DevelopmentPlan.create({
        userId: outsider._id,
        title: 'Begona reja',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-12-31'),
        createdBy: outsider._id,
      })
      await rejects(
        developmentPlanService.addGoal(managerActor(), String(foreign._id), {
          type: 'CUSTOM',
          title: 'Qo‘shib qo‘yaman',
        }),
        'DEVPLAN_SCOPE_FORBIDDEN'
      )
      await DevelopmentPlan.deleteOne({ _id: foreign._id })
    })
  })

  describe('who may read it', () => {
    test('the employee reads their own', async () => {
      const own = await developmentPlanService.getById(employeeActor(employee), plan.id)
      assert.equal(own.id, plan.id)
      const mine = await developmentPlanService.mine(String(employee._id))
      assert.equal(mine.items.length, 1)
    })

    test('a colleague cannot read it', async () => {
      await rejects(developmentPlanService.getById(employeeActor(colleague), plan.id), 'DEVPLAN_NOT_OWN')
    })

    test('and neither can a manager from another department', async () => {
      const foreignManager = { ...managerActor(), id: String(outsider._id) }
      await rejects(developmentPlanService.getById(foreignManager, plan.id), 'DEVPLAN_SCOPE_FORBIDDEN')
    })
  })

  describe('progress nobody types', () => {
    test('a course goal starts where the course record does', async () => {
      const fresh = await developmentPlanService.getById(managerActor(), plan.id)
      const goal = fresh.goals.find((entry) => entry.id === courseGoalId)
      assert.equal(goal.progressSource, 'DERIVED')
      assert.equal(goal.progressPercent, 0)
      assert.equal(goal.status, 'PLANNED')
    })

    test('typing a percentage onto it is refused, not ignored', async () => {
      await rejects(
        developmentPlanService.setGoalProgress(managerActor(), plan.id, courseGoalId, { progressPercent: 90 }),
        'GOAL_PROGRESS_DERIVED'
      )
      await rejects(
        developmentPlanService.setGoalProgress(managerActor(), plan.id, competencyGoalId, { progressPercent: 90 }),
        'GOAL_PROGRESS_DERIVED'
      )
    })

    test('finishing the course moves the goal without anyone touching the plan', async () => {
      await CourseAssignment.create({
        userId: employee._id,
        courseId: course._id,
        assignedBy: manager._id,
        status: 'COMPLETED',
        completedAt: new Date(),
      })
      const fresh = await developmentPlanService.getById(managerActor(), plan.id)
      const goal = fresh.goals.find((entry) => entry.id === courseGoalId)
      assert.equal(goal.progressPercent, 100)
      assert.equal(goal.status, 'ACHIEVED')
    })

    test('a competency goal follows the assessed level', async () => {
      await UserCompetency.create({
        userId: employee._id,
        competencyId: competency._id,
        level: 2,
        source: 'MANAGER',
        assessedBy: manager._id,
      })
      const fresh = await developmentPlanService.getById(managerActor(), plan.id)
      const goal = fresh.goals.find((entry) => entry.id === competencyGoalId)
      // 0 held when the goal was written, 3 required, 2 today.
      assert.equal(goal.currentLevel, 2)
      assert.equal(goal.targetLevel, 3)
      assert.equal(goal.progressPercent, 67)
      assert.equal(goal.status, 'IN_PROGRESS')
    })

    test('a custom goal is the one the employee may move themselves', async () => {
      const updated = await developmentPlanService.setGoalProgress(employeeActor(employee), plan.id, customGoalId, {
        progressPercent: 40,
      })
      const goal = updated.goals.find((entry) => entry.id === customGoalId)
      assert.equal(goal.progressSource, 'MANUAL')
      assert.equal(goal.progressPercent, 40)
    })

    test('but not somebody else’s custom goal', async () => {
      await rejects(
        developmentPlanService.setGoalProgress(employeeActor(colleague), plan.id, customGoalId, {
          progressPercent: 100,
        }),
        'DEVPLAN_NOT_OWN'
      )
    })

    test('the plan rolls up weighted, dropped goals excluded', async () => {
      const fresh = await developmentPlanService.getById(managerActor(), plan.id)
      // course 100 (weight 2), competency 67, custom 40 → (200+67+40)/4
      assert.equal(fresh.progressPercent, 77)
    })
  })

  describe('the review', () => {
    let firstReview

    test('a manager approves the plan', async () => {
      const result = await developmentPlanService.review(managerActor(), plan.id, {
        decision: 'APPROVED',
        period: 'H2 2026',
        overallRating: 4,
        comment: 'Kurs tugadi, kompetensiya yo‘lda.',
      })
      firstReview = result.review
      assert.equal(firstReview.planVersion, 1)
      assert.equal(firstReview.progressPercent, 77)
      assert.equal(firstReview.snapshot.length, 3)

      const stored = await DevelopmentPlan.findById(plan.id).lean()
      assert.equal(stored.lockedVersion, 1)
      assert.equal(stored.status, 'REVIEWED')
    })

    test('the approval is written to the audit log', async () => {
      const entry = await AuditLog.findOne({ action: 'DEVPLAN_APPROVED', entityId: String(plan.id) }).lean()
      assert.ok(entry, 'an approval has to leave a record')
      assert.equal(entry.metadata.planVersion, 1)
      assert.equal(entry.metadata.decision, 'APPROVED')
    })

    test('the same edition cannot be approved twice', async () => {
      await rejects(
        developmentPlanService.review(managerActor(), plan.id, { decision: 'APPROVED' }),
        'PLAN_VERSION_LOCKED'
      )
    })

    test('editing a goal afterwards makes a new edition, and leaves the old one alone', async () => {
      await developmentPlanService.updateGoal(managerActor(), plan.id, customGoalId, {
        title: 'Boshqa kitob o‘qish',
      })
      const stored = await DevelopmentPlan.findById(plan.id).lean()
      assert.equal(stored.version, 2, 'a changed plan is a new edition')
      assert.equal(stored.lockedVersion, 1, 'the approval still refers to edition 1')
      assert.equal(stored.status, 'ACTIVE', 'and the plan is no longer "reviewed"')

      // The frozen copy is exactly what was approved, not what the plan says
      // now — that is the whole point of taking one.
      const review = await PlanReview.findById(firstReview.id).lean()
      const snapshotGoal = review.snapshot.find((entry) => entry.id === customGoalId)
      assert.equal(snapshotGoal.title, 'Kitob o‘qish')
      assert.equal(snapshotGoal.progressPercent, 40)
    })

    test('the new edition can be approved on its own', async () => {
      const result = await developmentPlanService.review(managerActor(), plan.id, { decision: 'APPROVED' })
      assert.equal(result.review.planVersion, 2)
    })
  })

  describe('CPE credits in the existing PointsLedger', () => {
    test('the approval paid the achieved course goal exactly once', async () => {
      const rows = await PointsLedger.find({ userId: employee._id }).lean()
      assert.equal(rows.length, 1, 'one credit, one row')
      assert.equal(rows[0].points, 5)
      assert.equal(String(rows[0].courseId), String(course._id))
      // No parallel ledger: it is the same collection the gamification
      // engine reads for totals and badges.
      assert.equal(rows[0].videoId, null)
    })

    test('a repeated call credits nothing more', async () => {
      const again = await developmentPlanService.accrue(managerActor(), plan.id)
      assert.equal(again.totalCredits, 0)
      assert.equal(again.creditedGoals.length, 0)
      assert.equal(await PointsLedger.countDocuments({ userId: employee._id }), 1)
    })

    test('and the goal carries the claim that made it idempotent', async () => {
      const stored = await DevelopmentPlan.findById(plan.id).lean()
      const goal = stored.goals.find((entry) => String(entry._id) === courseGoalId)
      assert.ok(goal.cpeCreditedAt, 'the claim is the guard, not the ledger index')
    })

    test('an unachieved goal is not paid', async () => {
      await developmentPlanService.updateGoal(managerActor(), plan.id, competencyGoalId, { cpeCredits: 3 })
      const result = await developmentPlanService.accrue(managerActor(), plan.id)
      assert.equal(result.totalCredits, 0)
      assert.equal(await PointsLedger.countDocuments({ userId: employee._id }), 1)
    })
  })

  describe('gaps become goals', () => {
    test('the suggestion list comes from the competency service, not from a copy of it', async () => {
      const result = await developmentPlanService.suggestions(managerActor(), String(employee._id))
      const row = result.items.find((item) => item.competencyId === String(competency._id))
      assert.ok(row, 'the shortfall this person has has to be on the list')
      assert.equal(row.currentLevel, 2)
      assert.equal(row.requiredLevel, 3)
      assert.equal(row.gap, 1)
      assert.equal(row.courses[0].id, String(course._id))
    })

    test('and it refuses somebody outside the manager’s people', async () => {
      await rejects(
        developmentPlanService.suggestions(managerActor(), String(outsider._id)),
        'DEVPLAN_SCOPE_FORBIDDEN'
      )
    })
  })
})
