// AT-24 — search respects access.
//
//   GIVEN a course called "Maxfiy strategiya", visible only to Rahbariyat
//   WHEN  an ordinary employee searches for "maxfiy"
//   THEN  it is not in the results — not even its title
//
// A search result is a leak in its own right. "Maxfiy strategiya" in a list
// tells an employee the course exists, roughly what it is about and who it
// is for, without them ever opening it. So this is stricter than hiding the
// detail page.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { Course } from '../src/models/course.model.js'
import { KbArticle } from '../src/models/kbArticle.model.js'
import { LearningPath } from '../src/models/learningPath.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { globalSearchService } from '../src/services/search/globalSearch.service.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const LEADERSHIP = `Rahbariyat-${stamp}`

let boss
let employee
let secretCourse
let openCourse
let secretArticle
let path
const userIds = []

const bossActor = () => ({ id: boss._id.toString(), roleName: 'EMPLOYEE', permissions: [] })
const employeeActor = () => ({ id: employee._id.toString(), roleName: 'EMPLOYEE', permissions: [] })

async function makeUser(name, department = '') {
  const user = await User.create({
    firstName: name,
    lastName: 'Search',
    fullName: `${name} Search`,
    jshshir: `26${userIds.length}${stamp}`,
    passwordHash: await hashPassword('SearchTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
    department,
  })
  userIds.push(user._id)
  return user
}

describe('AT-24 · global search respects access', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    boss = await makeUser('Rahbar', LEADERSHIP)
    employee = await makeUser('Xodim')

    secretCourse = await Course.create({
      title: `Maxfiy strategiya ${stamp}`,
      slug: `maxfiy-strategiya-${stamp}`,
      description: 'Confidential',
      status: 'PUBLISHED',
      department: LEADERSHIP,
      createdBy: boss._id,
    })
    openCourse = await Course.create({
      title: `Maxfiy bo'lmagan kurs ${stamp}`,
      slug: `ochiq-kurs-${stamp}`,
      status: 'PUBLISHED',
      createdBy: boss._id,
    })

    secretArticle = await KbArticle.create({
      title: `Maxfiy protsedura ${stamp}`,
      slug: `maxfiy-protsedura-${stamp}`,
      status: 'PUBLISHED',
      department: LEADERSHIP,
      createdBy: boss._id,
    })

    path = await LearningPath.create({
      title: `Maxfiy yo'nalish ${stamp}`,
      slug: `maxfiy-yonalish-${stamp}`,
      status: 'PUBLISHED',
      department: LEADERSHIP,
      createdBy: boss._id,
    })
  })

  after(async () => {
    await Promise.all([
      Course.deleteMany({ _id: { $in: [secretCourse._id, openCourse._id] } }),
      KbArticle.deleteOne({ _id: secretArticle._id }),
      LearningPath.deleteOne({ _id: path._id }),
    ])
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('the acceptance case', () => {
    test('an ordinary employee does not see the restricted course', async () => {
      const { items } = await globalSearchService.search(employeeActor(), 'Maxfiy')
      const titles = items.map((item) => item.title)
      assert.ok(!titles.includes(secretCourse.title), 'not even the title may appear')
    })

    test('but does see the unrestricted one', async () => {
      const { items } = await globalSearchService.search(employeeActor(), 'Maxfiy')
      assert.ok(items.some((item) => item.id === String(openCourse._id)))
    })

    test('somebody in the department does see it', async () => {
      const { items } = await globalSearchService.search(bossActor(), 'Maxfiy')
      assert.ok(items.some((item) => item.id === String(secretCourse._id)))
    })
  })

  describe('the same rule across every type', () => {
    test('a restricted article is filtered out', async () => {
      const { items } = await globalSearchService.search(employeeActor(), 'Maxfiy')
      assert.ok(!items.some((item) => item.type === 'KB' && item.id === String(secretArticle._id)))
    })

    test('a restricted path is filtered out', async () => {
      const { items } = await globalSearchService.search(employeeActor(), 'Maxfiy')
      assert.ok(!items.some((item) => item.type === 'PATH' && item.id === String(path._id)))
    })

    test('all three are visible to somebody entitled', async () => {
      const { items } = await globalSearchService.search(bossActor(), 'Maxfiy')
      const types = new Set(items.map((item) => item.type))
      assert.ok(types.has('COURSE'))
      assert.ok(types.has('KB'))
      assert.ok(types.has('PATH'))
    })
  })

  describe('people', () => {
    test('somebody without user:read finds no people at all', async () => {
      const { items } = await globalSearchService.search(employeeActor(), 'Search')
      assert.equal(items.filter((item) => item.type === 'USER').length, 0)
    })

    test('with the permission, names match', async () => {
      const withPermission = { ...bossActor(), permissions: ['user:read'], scope: 'ALL' }
      const { items } = await globalSearchService.search(withPermission, 'Rahbar')
      assert.ok(items.some((item) => item.type === 'USER' && item.id === String(boss._id)))
    })

    test('a national id is not a search term', async () => {
      // Matching on JSHSHIR would turn the palette into a way of confirming
      // somebody's national id one guess at a time.
      const withPermission = { ...bossActor(), permissions: ['user:read'], scope: 'ALL' }
      const { items } = await globalSearchService.search(withPermission, boss.jshshir.slice(0, 8))
      assert.equal(items.filter((item) => item.type === 'USER').length, 0)
    })
  })

  describe('the query itself', () => {
    test('one character searches nothing', async () => {
      // Below two characters a prefix matches most of the database: the
      // result list is noise and the query is expensive.
      const { items } = await globalSearchService.search(employeeActor(), 'M')
      assert.deepEqual(items, [])
    })

    test('a regex from the search box is treated as literal text (AT-25)', async () => {
      // `(a+)+$` is catastrophic backtracking; unescaped it pins a CPU core
      // for as long as the request runs.
      const started = Date.now()
      const { items } = await globalSearchService.search(employeeActor(), '(a+)+$')
      assert.ok(Date.now() - started < 2000, 'a pattern must not be executed as one')
      assert.deepEqual(items, [])
    })

    test('a type filter narrows it', async () => {
      const { items } = await globalSearchService.search(bossActor(), 'Maxfiy', { types: ['KB'] })
      assert.ok(items.length > 0)
      assert.ok(items.every((item) => item.type === 'KB'))
    })
  })
})
