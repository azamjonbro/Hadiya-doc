// 13.2 — 360° review.
//
// Two things in this module are worth a test more than anything else, and
// they are the two the checklist names:
//
//   raters come off `managerId` — nobody picks them by hand, so a wrong
//   traversal silently sends the wrong questionnaires to the wrong people
//
//   anonymity is N≥3 — a gate that is one comparison in one function, and
//   the one bug in it that matters is the direction it fails in
//
// Everything else here is the integrity of a submission: it is yours, it
// happens while the cycle is open, and it happens once.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Competency } from '../src/models/competency.model.js'
import { UserCompetency } from '../src/models/userCompetency.model.js'
import { ReviewTemplate } from '../src/models/reviewTemplate.model.js'
import { ReviewCycle } from '../src/models/reviewCycle.model.js'
import { ReviewAssignment } from '../src/models/reviewAssignment.model.js'
import { ReviewResponse } from '../src/models/reviewResponse.model.js'
import { Notification } from '../src/models/notification.model.js'
import { review360Service, deriveRaters, isGroupRevealed } from '../src/services/review360/review360.service.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const DEPT = `Review360-${stamp}`

// `scope: 'ALL'` is not decoration: 13.1 fences `competencyService.assess`
// on the caller's own scope, so a closer who cannot reach the subject posts
// no level at all. An HR/admin token carries ALL, and the test has to carry
// what the real caller carries or it proves nothing about the integration.
const hr = {
  id: null,
  scope: 'ALL',
  permissions: ['review360:manage', 'review360:results:view', 'competency:manage', 'competency:assess'],
}

let employeeRole
let manager
let subject
let peers = []
let reports = []
let template
let cycle
let competency
let assignments = new Map()
const userIds = []

async function makeUser(name, extra = {}) {
  const user = await User.create({
    firstName: name,
    lastName: 'Test',
    fullName: `${name} Test`,
    jshshir: `36${userIds.length}${stamp}`,
    passwordHash: await hashPassword('Review360Test123!'),
    roleId: employeeRole._id,
    department: DEPT,
    ...extra,
  })
  userIds.push(user._id)
  return user
}

const actorFor = (user) => ({ id: user._id.toString(), permissions: ['review360:respond'] })

async function assignmentFor(user) {
  const row = await ReviewAssignment.findOne({ cycleId: cycle.id, subjectId: subject._id, raterId: user._id }).lean()
  return row
}

describe('360° review (13.2)', () => {
  before(async () => {
    await connectDatabase()
    employeeRole = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(employeeRole, 'EMPLOYEE role is missing — boot the server against this database once')

    // The shape under test:
    //
    //        manager
    //        /  |  \
    //   subject p1  p2          → 2 peers, below the threshold
    //   /  |  \   \
    //  r1  r2  r3  r4           → 4 subordinates, 3 of whom answer
    manager = await makeUser('Rahbar')
    subject = await makeUser('Subyekt', { managerId: manager._id })
    peers = [await makeUser('Hamkasb1', { managerId: manager._id }), await makeUser('Hamkasb2', { managerId: manager._id })]
    reports = []
    for (const name of ['Xodim1', 'Xodim2', 'Xodim3', 'Xodim4']) {
      reports.push(await makeUser(name, { managerId: subject._id }))
    }
    hr.id = manager._id.toString()

    competency = await Competency.create({
      code: `R360-${stamp}`,
      name: 'Jamoada ishlash',
      levels: [
        { value: 1, label: 'Boshlang‘ich' },
        { value: 2, label: 'O‘rta' },
        { value: 3, label: 'Yaxshi' },
        { value: 4, label: 'Kuchli' },
        { value: 5, label: 'Ekspert' },
      ],
      createdBy: manager._id,
    })
  })

  after(async () => {
    const cycleId = cycle?.id
    if (cycleId) {
      await Promise.all([
        ReviewResponse.deleteMany({ cycleId }),
        ReviewAssignment.deleteMany({ cycleId }),
        ReviewCycle.deleteOne({ _id: cycleId }),
        Notification.deleteMany({ relatedEntityType: 'ReviewCycle', relatedEntityId: String(cycleId) }),
      ])
    }
    await Promise.all([
      ReviewTemplate.deleteMany({ createdBy: { $in: userIds } }),
      UserCompetency.deleteMany({ competencyId: competency?._id }),
      Competency.deleteOne({ _id: competency?._id }),
    ])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the template', () => {
    test('a template is created as a draft with a threshold of 3', async () => {
      template = await review360Service.createTemplate(hr, {
        name: `Yillik 360 ${stamp}`,
        questions: [
          { text: 'Jamoada ishlaydi', type: 'RATING', scaleMax: 5, order: 0, competencyId: competency._id.toString() },
          { text: 'Nimani boshqacha qilsin?', type: 'TEXT', required: false, order: 1 },
          // Asked only of the people who are actually delegated to.
          { text: 'Vazifani aniq topshiradi', type: 'RATING', scaleMax: 5, order: 2, groups: ['SUBORDINATE', 'SELF'] },
        ],
      })
      assert.equal(template.status, 'DRAFT')
      assert.equal(template.anonymityThreshold, 3)
      assert.deepEqual(template.anonymousGroups.sort(), ['MANAGER', 'PEER', 'SUBORDINATE'])
      await ReviewTemplate.updateOne({ _id: template.id }, { $set: { status: 'ACTIVE' } })
    })
  })

  describe('raters come off managerId', () => {
    test('self, manager, peers and subordinates, and nobody else', async () => {
      const stored = await ReviewTemplate.findById(template.id).lean()
      const derived = await deriveRaters(await User.findById(subject._id).lean(), stored)
      const byGroup = {}
      for (const rater of derived) {
        byGroup[rater.raterGroup] = byGroup[rater.raterGroup] ?? []
        byGroup[rater.raterGroup].push(String(rater.raterId))
      }
      assert.deepEqual(byGroup.SELF, [subject._id.toString()])
      assert.deepEqual(byGroup.MANAGER, [manager._id.toString()])
      assert.deepEqual(byGroup.PEER.sort(), peers.map((peer) => peer._id.toString()).sort())
      assert.deepEqual(byGroup.SUBORDINATE.sort(), reports.map((report) => report._id.toString()).sort())
      // The subject is not their own peer, and the manager is not a peer of
      // their own report — both are one-off errors in the obvious query.
      assert.equal(byGroup.PEER.includes(subject._id.toString()), false)
      assert.equal(derived.length, 8)
    })

    test('somebody outside the reporting line is never asked', async () => {
      const outsider = await makeUser('Begona', { managerId: null })
      const stored = await ReviewTemplate.findById(template.id).lean()
      const derived = await deriveRaters(await User.findById(subject._id).lean(), stored)
      assert.equal(
        derived.some((rater) => String(rater.raterId) === outsider._id.toString()),
        false
      )
    })

    test('launching materialises exactly those questionnaires', async () => {
      cycle = await review360Service.createCycle(hr, {
        name: `Q3 sikli ${stamp}`,
        templateId: template.id,
        subjectIds: [subject._id.toString()],
        postToCompetencies: true,
      })
      assert.equal(cycle.status, 'DRAFT')

      const preview = await review360Service.previewRaters(cycle.id)
      assert.equal(preview.subjects[0].counts.PEER, 2)
      // The warning HR needs before sending anything: this group will never
      // clear the gate.
      assert.ok(preview.subjects[0].sealedGroups.includes('PEER'))

      const launched = await review360Service.launch(hr, cycle.id)
      assert.equal(launched.status, 'RUNNING')
      assert.equal(await ReviewAssignment.countDocuments({ cycleId: cycle.id }), 8)
      // The instrument is frozen onto the cycle, not read through the
      // template at display time.
      assert.equal(launched.questions.length, 3)
      cycle = launched
    })

    test('every rater is told, once, however many people they were asked about', async () => {
      // A cycle that materialises eight questionnaires and tells nobody is a
      // cycle that closes empty: nothing else in the product surfaces an
      // assignment, and the window is measured in days. The second half —
      // one notice per rater rather than per assignment — is what keeps a
      // manager of eight from getting eight identical messages.
      const notices = await Notification.find({
        type: 'REVIEW360_INVITED',
        relatedEntityId: String(cycle.id),
      }).lean()

      const raters = await ReviewAssignment.distinct('raterId', { cycleId: cycle.id })
      assert.equal(notices.length, raters.length)

      const byUser = new Set(notices.map((notice) => String(notice.userId)))
      assert.equal(byUser.size, notices.length, 'a rater was notified twice')

      // Rendered from the template, not left as the raw enum name — the
      // failure mode when a type is used with no seed behind it.
      assert.ok(notices[0].title.includes(cycle.name), `title was not rendered: ${notices[0].title}`)
      assert.ok(notices[0].message.length > 0, 'the notice has no body')
    })
  })

  describe('answering', () => {
    test('a rater only sees the questions their group is asked', async () => {
      const peerAssignment = await assignmentFor(peers[0])
      const view = await review360Service.getAssignment(actorFor(peers[0]), peerAssignment._id)
      assert.equal(view.raterGroup, 'PEER')
      assert.equal(view.questions.length, 2, 'the delegation question is not asked of a peer')

      const reportAssignment = await assignmentFor(reports[0])
      const reportView = await review360Service.getAssignment(actorFor(reports[0]), reportAssignment._id)
      assert.equal(reportView.questions.length, 3)
    })

    test('one person cannot answer another’s questionnaire', async () => {
      const target = await assignmentFor(peers[1])
      await assert.rejects(
        () => review360Service.getAssignment(actorFor(peers[0]), target._id),
        (error) => error.code === 'NOT_YOUR_ASSIGNMENT'
      )
      await assert.rejects(
        () =>
          review360Service.submit(actorFor(peers[0]), target._id, {
            answers: [{ questionId: cycle.questions[0].id, rating: 1 }],
          }),
        (error) => error.code === 'NOT_YOUR_ASSIGNMENT'
      )
    })

    test('a required question cannot be skipped', async () => {
      const own = await assignmentFor(peers[0])
      await assert.rejects(
        () => review360Service.submit(actorFor(peers[0]), own._id, { answers: [] }),
        (error) => error.code === 'ANSWER_REQUIRED'
      )
    })

    test('a rating off the scale is refused', async () => {
      const own = await assignmentFor(peers[0])
      await assert.rejects(
        () =>
          review360Service.submit(actorFor(peers[0]), own._id, {
            answers: [{ questionId: cycle.questions[0].id, rating: 9 }],
          }),
        (error) => error.code === 'RATING_OFF_SCALE'
      )
    })

    test('everybody who is going to answer, answers', async () => {
      const teamwork = cycle.questions[0].id
      const comment = cycle.questions[1].id
      const delegation = cycle.questions[2].id

      const answerAs = async (user, rating, extra = []) => {
        const own = await assignmentFor(user)
        assignments.set(user._id.toString(), own._id)
        await review360Service.submit(actorFor(user), own._id, {
          answers: [{ questionId: teamwork, rating }, ...extra],
        })
      }

      await answerAs(subject, 5, [{ questionId: delegation, rating: 5 }])
      await answerAs(manager, 4)
      await answerAs(peers[0], 3, [{ questionId: comment, text: 'Ko‘proq gapirsin' }])
      await answerAs(peers[1], 3)
      await answerAs(reports[0], 2, [{ questionId: delegation, rating: 2 }])
      await answerAs(reports[1], 2, [{ questionId: delegation, rating: 3 }])
      await answerAs(reports[2], 3, [
        { questionId: delegation, rating: 2 },
        { questionId: comment, text: 'Vazifani aniqroq tushuntirsin' },
      ])
      // reports[3] deliberately never answers — that PENDING questionnaire
      // is what the "closed cycle refuses a late answer" test uses.

      assert.equal(await ReviewResponse.countDocuments({ cycleId: cycle.id }), 7)
      assert.equal(await ReviewAssignment.countDocuments({ cycleId: cycle.id, status: 'SUBMITTED' }), 7)
    })

    test('a submitted questionnaire cannot be edited', async () => {
      const own = assignments.get(peers[0]._id.toString())
      await assert.rejects(
        () =>
          review360Service.submit(actorFor(peers[0]), own, {
            answers: [{ questionId: cycle.questions[0].id, rating: 5 }],
          }),
        (error) => error.code === 'ALREADY_SUBMITTED'
      )
      // And the stored answer is still the first one.
      const stored = await ReviewResponse.findOne({ assignmentId: own }).lean()
      assert.equal(stored.answers[0].rating, 3)
    })

    test('a response carries the group but never the rater', async () => {
      const stored = await ReviewResponse.findOne({ assignmentId: assignments.get(peers[0]._id.toString()) }).lean()
      assert.equal(stored.raterGroup, 'PEER')
      assert.equal('raterId' in stored, false)
    })

    test('results are refused while the cycle is still running', async () => {
      // A running aggregate can be differenced across one more submission,
      // which de-anonymises that submission whatever N is.
      await assert.rejects(
        () => review360Service.results(hr, cycle.id, subject._id.toString(), {}),
        (error) => error.code === 'CYCLE_NOT_CLOSED'
      )
    })
  })

  describe('closing', () => {
    test('closing posts the resulting level to userCompetency as REVIEW360', async () => {
      const closed = await review360Service.close(hr, cycle.id)
      assert.equal(closed.status, 'CLOSED')
      assert.equal(closed.competencyLevelsPosted, 1)
      assert.deepEqual(closed.competencyLevelsSkipped, [])

      const row = await UserCompetency.findOne({ userId: subject._id, competencyId: competency._id }).lean()
      assert.ok(row, '13.1 is where a 360° level ends up — not a second store inside this module')
      assert.equal(row.source, 'REVIEW360')
      // Ratings 5,4,3,3,2,2,3 out of 5 → mean 3.14 → level 3 on a 1–5 scale.
      assert.equal(row.level, 3)
      assert.equal(row.evidence.type, 'REVIEW360')
    })

    test('a closed cycle refuses a late answer', async () => {
      const late = await assignmentFor(reports[3])
      assert.equal(late.status, 'PENDING')
      await assert.rejects(
        () =>
          review360Service.submit(actorFor(reports[3]), late._id, {
            answers: [{ questionId: cycle.questions[0].id, rating: 5 }],
          }),
        (error) => error.code === 'CYCLE_NOT_RUNNING'
      )
    })
  })

  describe('anonymity — N≥3', () => {
    let results

    test('a group of 2 is sealed, a group of 3 is revealed', async () => {
      results = await review360Service.results(hr, cycle.id, subject._id.toString(), {})
      const byGroup = Object.fromEntries(results.groups.map((row) => [row.group, row]))

      assert.equal(byGroup.PEER.responded, 2)
      assert.equal(byGroup.PEER.revealed, false, '2 answers must not be shown when the threshold is 3')
      assert.equal(byGroup.SUBORDINATE.responded, 3)
      assert.equal(byGroup.SUBORDINATE.revealed, true)
      // One manager is not anonymity, whatever the label says.
      assert.equal(byGroup.MANAGER.revealed, false)
      // The subject reading their own self-assessment is not a leak.
      assert.equal(byGroup.SELF.revealed, true)
    })

    test('a sealed group carries no number derived from its answers', async () => {
      const teamwork = results.questions[0]
      const peerCell = teamwork.groups.find((row) => row.group === 'PEER')
      assert.equal(peerCell.revealed, false)
      assert.equal(peerCell.average, null)
      assert.equal(peerCell.count, null)

      const reportCell = teamwork.groups.find((row) => row.group === 'SUBORDINATE')
      assert.equal(reportCell.average, 2.33)
      assert.equal(reportCell.count, 3)
    })

    test('the "others" average is built from revealed groups only', async () => {
      // Otherwise it is arithmetic to recover the sealed groups: overall
      // total minus the revealed ones is exactly what they said.
      const teamwork = results.questions[0]
      assert.equal(teamwork.self, 5)
      assert.equal(teamwork.others, 2.33, 'only the three subordinates count')
      assert.equal(teamwork.gap, 2.67)
    })

    test('comments from a sealed group are not shown', async () => {
      const comment = results.questions[1]
      const groups = comment.comments.map((entry) => entry.group)
      assert.equal(groups.includes('PEER'), false, 'the peer comment belongs to a sealed group')
      assert.deepEqual(groups, ['SUBORDINATE'])
      assert.equal(comment.comments[0].text, 'Vazifani aniqroq tushuntirsin')
    })

    test('the gate itself, in isolation', () => {
      const cfg = { anonymousGroups: ['PEER'], anonymityThreshold: 3 }
      assert.equal(isGroupRevealed('PEER', 2, cfg), false)
      assert.equal(isGroupRevealed('PEER', 3, cfg), true)
      // A group nobody promised anonymity to is shown as it is.
      assert.equal(isGroupRevealed('SELF', 1, cfg), true)
    })
  })

  describe('who may read a report', () => {
    test('the subject may read their own without any admin permission', async () => {
      const own = await review360Service.results(actorFor(subject), cycle.id, subject._id.toString(), {})
      assert.equal(own.subject.id, subject._id.toString())
    })

    test('a colleague may not read somebody else’s', async () => {
      await assert.rejects(
        () => review360Service.results(actorFor(peers[0]), cycle.id, subject._id.toString(), {}),
        (error) => error.code === 'NOT_YOUR_RESULTS'
      )
    })

    test('a manager fenced to another team is refused', async () => {
      await assert.rejects(
        () =>
          review360Service.results(hr, cycle.id, subject._id.toString(), {
            scopedUserIds: [manager._id.toString()],
          }),
        (error) => error.code === 'SCOPE_FORBIDDEN'
      )
    })
  })
})
