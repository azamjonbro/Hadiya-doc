// The org chart (2.1) — and mostly, the ways it can be wrong.
//
// `managedUserIds` becomes the foundation of manager scope in 2.2, which
// means a bug here is a permissions bug: too few ids and a manager cannot
// see their own team, too many and they can see somebody else's. So the
// transitive walk, the cycle refusal and the cache invalidation are each
// asserted rather than assumed.

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { orgHierarchyService } from '../src/services/org/orgHierarchy.service.js'
import { parseCsv, planUpdates, findCycles } from '../src/scripts/migrateUserHierarchy.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-11)
let seq = 0
let role
const people = {}
const idsCreated = []

async function makePerson(name, managerId = null) {
  const user = await User.create({
    firstName: name,
    lastName: 'Org',
    fullName: `${name} Org`,
    jshshir: `44${seq++}${stamp}`,
    passwordHash: await hashPassword('OrgTest123!'),
    roleId: role._id,
    managerId,
  })
  idsCreated.push(user._id)
  people[name] = user
  return user
}

describe('org hierarchy', () => {
  before(async () => {
    await connectDatabase()
    role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server against this database once')

    //   ceo
    //    +-- director
    //    |     +-- lead
    //    |     |     +-- junior
    //    |     +-- analyst
    //    +-- assistant
    await makePerson('ceo')
    await makePerson('director', people.ceo._id)
    await makePerson('lead', people.director._id)
    await makePerson('junior', people.lead._id)
    await makePerson('analyst', people.director._id)
    await makePerson('assistant', people.ceo._id)
  })

  after(async () => {
    await User.deleteMany({ _id: { $in: idsCreated } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  beforeEach(async () => {
    // Every assertion below is about a fresh answer, not a five-minute-old
    // one; the cache is exercised by its own test.
    for (const person of Object.values(people)) await orgHierarchyService.invalidateFor(person._id)
  })

  describe('managedUserIds', () => {
    test('is transitive — a director manages the whole branch, not one level', async () => {
      const ids = await orgHierarchyService.managedUserIds(people.director._id)
      assert.deepEqual(
        ids.map(String).sort(),
        [people.lead._id, people.junior._id, people.analyst._id].map(String).sort()
      )
    })

    test('the top of the chart manages everyone below it', async () => {
      const ids = await orgHierarchyService.managedUserIds(people.ceo._id)
      assert.equal(ids.length, 5)
    })

    test('someone with no reports manages nobody, which is not an error', async () => {
      assert.deepEqual(await orgHierarchyService.managedUserIds(people.junior._id), [])
    })

    test('a sibling branch is not included', async () => {
      const ids = (await orgHierarchyService.managedUserIds(people.director._id)).map(String)
      assert.ok(!ids.includes(String(people.assistant._id)), 'a manager could see another branch')
      assert.ok(!ids.includes(String(people.ceo._id)), 'a manager could see their own manager')
    })
  })

  describe('managerChain', () => {
    test('lists the managers above someone, nearest first', async () => {
      const chain = await orgHierarchyService.managerChain(people.junior._id)
      assert.deepEqual(
        chain.map((row) => String(row._id)),
        [people.lead._id, people.director._id, people.ceo._id].map(String)
      )
    })

    test('is empty at the top', async () => {
      assert.deepEqual(await orgHierarchyService.managerChain(people.ceo._id), [])
    })
  })

  describe('refusing loops', () => {
    test('nobody may report to themselves', async () => {
      await assert.rejects(
        () => orgHierarchyService.assertNoCycle(people.lead._id, people.lead._id),
        (error) => {
          assert.equal(error.code, 'HIERARCHY_CYCLE')
          return true
        }
      )
    })

    test('a manager may not be moved under their own report', async () => {
      // director -> junior would close the loop director > lead > junior.
      await assert.rejects(
        () => orgHierarchyService.assertNoCycle(people.director._id, people.junior._id),
        /loop/i
      )
    })

    test('a legitimate move is allowed', async () => {
      await orgHierarchyService.assertNoCycle(people.junior._id, people.assistant._id)
    })

    test('clearing a manager is always allowed', async () => {
      await orgHierarchyService.assertNoCycle(people.lead._id, null)
    })
  })

  describe('the subtree', () => {
    test('nests reports under the person they report to', async () => {
      const tree = await orgHierarchyService.subtree(people.director._id)
      assert.equal(tree.id, String(people.director._id))
      assert.deepEqual(
        tree.reports.map((node) => node.fullName).sort(),
        ['analyst Org', 'lead Org']
      )
      const lead = tree.reports.find((node) => node.fullName === 'lead Org')
      assert.deepEqual(lead.reports.map((node) => node.fullName), ['junior Org'])
    })

    test('a leaf has an empty reports array rather than a missing one', async () => {
      const tree = await orgHierarchyService.subtree(people.junior._id)
      assert.deepEqual(tree.reports, [])
    })
  })

  describe('the cache', () => {
    test('moving someone drops the answer for the managers above both ends', async () => {
      // analyst starts under director; move them under assistant, which is
      // a different branch, and both branches' answers have to change.
      await orgHierarchyService.managedUserIds(people.director._id)
      await orgHierarchyService.managedUserIds(people.assistant._id)

      await User.updateOne({ _id: people.analyst._id }, { $set: { managerId: people.assistant._id } })
      await orgHierarchyService.invalidateFor(people.analyst._id)
      await orgHierarchyService.invalidateFor(people.director._id)

      const directorNow = (await orgHierarchyService.managedUserIds(people.director._id)).map(String)
      const assistantNow = (await orgHierarchyService.managedUserIds(people.assistant._id)).map(String)
      assert.ok(!directorNow.includes(String(people.analyst._id)), 'the old manager still sees them')
      assert.ok(assistantNow.includes(String(people.analyst._id)), 'the new manager cannot see them')

      await User.updateOne({ _id: people.analyst._id }, { $set: { managerId: people.director._id } })
    })
  })
})

describe('migration M2 · reading an HR export', () => {
  test('parses a header and quoted fields', () => {
    const rows = parseCsv('jshshir,managerJshshir,name\n"12345678901234","43210987654321","Karimov, Aziz"\n')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].jshshir, '12345678901234')
    assert.equal(rows[0].name, 'Karimov, Aziz')
  })

  test('ignores blank lines and trims', () => {
    assert.equal(parseCsv('jshshir\n  111  \n\n').length, 1)
  })

  test('an empty file is not an error', () => {
    assert.deepEqual(parseCsv(''), [])
    assert.deepEqual(parseCsv('jshshir,managerJshshir\n'), [])
  })

  const idA = new mongoose.Types.ObjectId()
  const idB = new mongoose.Types.ObjectId()
  const usersByJshshir = new Map([
    ['11111111111111', { _id: idA, jshshir: '11111111111111', managerId: null }],
    ['22222222222222', { _id: idB, jshshir: '22222222222222', managerId: null }],
  ])

  test('plans the writes it can and reports the rows it cannot', () => {
    const { updates, problems } = planUpdates(
      [
        { jshshir: '11111111111111', managerJshshir: '22222222222222' },
        { jshshir: '99999999999999', managerJshshir: '22222222222222' },
        { jshshir: '11111111111111', managerJshshir: '88888888888888' },
        { jshshir: '', managerJshshir: '22222222222222' },
      ],
      usersByJshshir
    )
    assert.equal(updates.length, 1)
    assert.equal(String(updates[0].set.managerId), String(idB))
    assert.equal(problems.length, 3)
    assert.match(problems[0], /no account with JSHSHIR 99999999999999/)
    assert.match(problems[1], /manager 88888888888888 has no account/)
    assert.match(problems[2], /no jshshir/)
  })

  test('a row that changes nothing is not a write', () => {
    const settled = new Map([['11111111111111', { _id: idA, jshshir: '11111111111111', managerId: idB }]])
    const { updates } = planUpdates([{ jshshir: '11111111111111', managerJshshir: '22222222222222' }], settled)
    assert.deepEqual(updates, [])
  })

  test('someone listed as their own manager is refused', () => {
    const { updates, problems } = planUpdates(
      [{ jshshir: '11111111111111', managerJshshir: '11111111111111' }],
      usersByJshshir
    )
    assert.deepEqual(updates, [])
    assert.match(problems[0], /their own manager/)
  })

  test('a loop split across two rows is caught before anything is written', () => {
    // A -> B and B -> A are each valid on their own line. Only the pair is
    // wrong, which is why the check runs over the whole plan.
    const usersById = new Map([
      [String(idA), { _id: idA, jshshir: '11111111111111', managerId: null }],
      [String(idB), { _id: idB, jshshir: '22222222222222', managerId: null }],
    ])
    const updates = [
      { _id: idA, jshshir: '1', set: { managerId: idB } },
      { _id: idB, jshshir: '2', set: { managerId: idA } },
    ]
    assert.equal(findCycles(updates, usersById).length, 1)
  })

  test('a well-formed chart has no loops', () => {
    const usersById = new Map([
      [String(idA), { _id: idA, jshshir: '1', managerId: null }],
      [String(idB), { _id: idB, jshshir: '2', managerId: null }],
    ])
    assert.deepEqual(findCycles([{ _id: idB, jshshir: '2', set: { managerId: idA } }], usersById), [])
  })
})
