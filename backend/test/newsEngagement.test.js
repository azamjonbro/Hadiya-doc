// Portal §3 — ♡ and 💬 under a news item.
//
// Likes are rows with a unique (news, user) index and the count is derived,
// so a toggle is idempotent per person; comments are flat plain text, soft
// deleted, own-or-news:manage to remove. Over HTTP because the permission
// story is the point.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { News } from '../src/models/news.model.js'
import { NewsReaction } from '../src/models/newsReaction.model.js'
import { NewsComment } from '../src/models/newsComment.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { redisConnection } from '../src/config/redis.js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1'
const PASSWORD = 'NewsTest123!'
const stamp = String(Date.now()).slice(-9)

const users = {}
const tokens = {}
let published
let draft

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    // status is what the caller asserts on
  }
  return { status: res.status, body }
}

const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` })

async function makeUser(key, roleName, n) {
  const role = await Role.findOne({ name: roleName })
  assert.ok(role, `${roleName} role is missing — boot the server against this database once`)
  users[key] = await User.create({
    firstName: key,
    lastName: 'News',
    fullName: `${key} News`,
    jshshir: `17${stamp}${n}`,
    passwordHash: await hashPassword(PASSWORD),
    roleId: role._id,
  })
  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: users[key].jshshir, password: PASSWORD }),
  })
  assert.equal(status, 200, `login failed: ${JSON.stringify(body)}`)
  tokens[key] = body.data.accessToken
}

describe('news likes and comments', () => {
  before(async () => {
    await connectDatabase()
    await makeUser('a', 'EMPLOYEE', '001')
    await makeUser('b', 'EMPLOYEE', '002')
    await makeUser('admin', 'SUPERADMIN', '003')
    published = await News.create({
      title: `Engagement ${stamp}`,
      content: 'x',
      status: 'PUBLISHED',
      createdBy: users.admin._id,
    })
    draft = await News.create({
      title: `Engagement draft ${stamp}`,
      content: 'x',
      status: 'DRAFT',
      createdBy: users.admin._id,
    })
  })

  after(async () => {
    const ids = [published._id, draft._id]
    await NewsReaction.deleteMany({ newsId: { $in: ids } })
    await NewsComment.deleteMany({ newsId: { $in: ids } })
    await News.deleteMany({ _id: { $in: ids } })
    await User.deleteMany({ _id: { $in: Object.values(users).map((u) => u._id) } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  test('a like toggles per person and the count is the number of people', async () => {
    const id = published._id
    let r = await api(`/news/${id}/like`, { method: 'POST', headers: as('a') })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.deepEqual(r.body.data, { liked: true, likes: 1 })

    r = await api(`/news/${id}/like`, { method: 'POST', headers: as('b') })
    assert.deepEqual(r.body.data, { liked: true, likes: 2 })

    // Toggle off, then the article and the feed carry the right numbers.
    r = await api(`/news/${id}/like`, { method: 'POST', headers: as('a') })
    assert.deepEqual(r.body.data, { liked: false, likes: 1 })

    const one = await api(`/news/${id}`, { headers: as('b') })
    assert.equal(one.body.data.likes, 1)
    assert.equal(one.body.data.liked, true)
    const other = await api(`/news/${id}`, { headers: as('a') })
    assert.equal(other.body.data.liked, false)

    const feed = await api('/news/feed?limit=100', { headers: as('b') })
    const row = feed.body.data.items.find((item) => item.id === String(id))
    assert.ok(row, 'the article is in the feed')
    assert.equal(row.likes, 1)
    assert.equal(row.liked, true)
    assert.equal(row.comments, 0)
  })

  test('comments: add, list, remove own, not someone else’s without news:manage', async () => {
    const id = published._id
    const bad = await api(`/news/${id}/comments`, { method: 'POST', headers: as('a'), body: JSON.stringify({ body: '   ' }) })
    assert.equal(bad.status, 400)

    const mine = await api(`/news/${id}/comments`, { method: 'POST', headers: as('a'), body: JSON.stringify({ body: 'Tabriklaymiz!' }) })
    assert.equal(mine.status, 201, JSON.stringify(mine.body))
    assert.equal(mine.body.data.fullName, 'a News')
    const theirs = await api(`/news/${id}/comments`, { method: 'POST', headers: as('b'), body: JSON.stringify({ body: 'Rahmat' }) })
    assert.equal(theirs.status, 201)

    const list = await api(`/news/${id}/comments`, { headers: as('a') })
    assert.deepEqual(list.body.data.items.map((c) => c.body), ['Tabriklaymiz!', 'Rahmat'])

    const forbidden = await api(`/news/${id}/comments/${theirs.body.data.id}`, { method: 'DELETE', headers: as('a') })
    assert.equal(forbidden.status, 403)
    const own = await api(`/news/${id}/comments/${mine.body.data.id}`, { method: 'DELETE', headers: as('a') })
    assert.equal(own.status, 200)
    const byAdmin = await api(`/news/${id}/comments/${theirs.body.data.id}`, { method: 'DELETE', headers: as('admin') })
    assert.equal(byAdmin.status, 200)

    const after = await api(`/news/${id}/comments`, { headers: as('a') })
    assert.equal(after.body.data.items.length, 0)
    // Soft deleted: the rows are still there for the audit trail.
    assert.equal(await NewsComment.countDocuments({ newsId: id }), 2)
  })

  test('a draft cannot be liked or discussed by a reader', async () => {
    const like = await api(`/news/${draft._id}/like`, { method: 'POST', headers: as('a') })
    assert.equal(like.status, 404)
    const comment = await api(`/news/${draft._id}/comments`, { method: 'POST', headers: as('a'), body: JSON.stringify({ body: 'x' }) })
    assert.equal(comment.status, 404)
    const anon = await api(`/news/${published._id}/like`, { method: 'POST' })
    assert.equal(anon.status, 401)
  })
})
